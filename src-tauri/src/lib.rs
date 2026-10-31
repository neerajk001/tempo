use std::io::{Read, Write};
use std::net::TcpListener;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::StateFlags;

mod blocking;
mod platform;

const MAIN: &str = "main";
const MINI: &str = "mini";
const TRAY_ID: &str = "tempo-tray";

/// The tray's "Show mini timer" check item, kept so the widget's own close
/// button can uncheck it without a second source of truth.
struct MiniMenuItem(std::sync::Mutex<Option<CheckMenuItem<tauri::Wry>>>);

/// Bring the main window back to the foreground.
fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Toggle the main window between hidden and shown (tray + hotkey).
fn toggle_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let visible = window.is_visible().unwrap_or(false);
        let minimized = window.is_minimized().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        // Only hide when the window is actually in front. A visible-but-covered
        // or minimized window should be brought forward instead.
        if visible && !minimized && focused {
            let _ = window.hide();
        } else {
            show_main(app);
        }
    }
}

/// Create the small always-on-top timer widget, hidden until toggled.
fn build_mini_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    const W: f64 = 252.0;
    const H: f64 = 58.0;

    let mut x = 48.0;
    let mut y = 48.0;
    // Place the widget on the monitor that owns the main window, falling back
    // to the primary monitor when the main window is not available.
    let monitor = app
        .get_webview_window(MAIN)
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let size = monitor.size();
        let logical_w = size.width as f64 / scale;
        let logical_h = size.height as f64 / scale;
        x = (logical_w - W - 24.0).max(0.0);
        y = (logical_h - H - 72.0).max(0.0);
    }

    WebviewWindowBuilder::new(app, MINI, WebviewUrl::App("index.html".into()))
        .title("Tempo Mini")
        .inner_size(W, H)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible(false)
        .initialization_script("window.__TEMPO_MINI__ = true;")
        .build()?;

    Ok(())
}

/// Called once per second by the main window to keep the tray tooltip live.
#[tauri::command]
fn set_tray_tooltip(app: tauri::AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(&text));
    }
}

/// Bring the main window forward (used by the mini widget's expand button).
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    show_main(&app);
}

/// Hide the mini widget and keep the tray check item in sync.
#[tauri::command]
fn hide_mini_window(app: tauri::AppHandle, item: tauri::State<'_, MiniMenuItem>) {
    if let Some(window) = app.get_webview_window(MINI) {
        let _ = window.hide();
    }
    if let Ok(guard) = item.0.lock() {
        if let Some(menu_item) = guard.as_ref() {
            let _ = menu_item.set_checked(false);
        }
    }
}

/// Whether the host can actually block sites (the Focus Guard is Windows-only).
#[tauri::command]
fn blocking_supported() -> bool {
    cfg!(windows)
}

/// Whether the host reports system-wide idle time (Windows-only).
#[tauri::command]
fn idle_supported() -> bool {
    cfg!(windows)
}

// --- Account linking -------------------------------------------------------
//
// The desktop app signs in through the system browser. A loopback listener
// receives the short-lived login token, which the webview exchanges for a sync
// token and stores here. Keeping the listener and the file in Rust means the
// token never has to live in browser storage.

const AUTH_EVENT: &str = "tempo://auth-result";

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthRecord {
    token: String,
    user: serde_json::Value,
    expires_at: u64,
}

fn auth_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No app data directory: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create app data directory: {e}"))?;
    Ok(dir.join("desktop-auth.json"))
}

#[tauri::command]
fn desktop_auth_load(app: tauri::AppHandle) -> Option<AuthRecord> {
    let path = auth_path(&app).ok()?;
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
fn desktop_auth_save(app: tauri::AppHandle, record: AuthRecord) -> Result<(), String> {
    let path = auth_path(&app)?;
    let raw = serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| format!("Could not save sign-in: {e}"))
}

#[tauri::command]
fn desktop_auth_clear(app: tauri::AppHandle) -> Result<(), String> {
    if let Ok(path) = auth_path(&app) {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        if k == key {
            urlencoding::decode(v).ok().map(|c| c.into_owned())
        } else {
            None
        }
    })
}

/// Bind a loopback listener, open the browser at the sign-in URL, and emit the
/// returned login token (or an error) to the main window.
#[tauri::command]
fn start_desktop_auth(
    app: tauri::AppHandle,
    state: String,
    api_base: String,
    code_challenge: String,
) -> Result<serde_json::Value, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Could not open the sign-in listener: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Could not read the listener address: {e}"))?
        .port();
    let redirect = format!("http://127.0.0.1:{port}/callback");
    let url = format!(
        "{}/api/desktop/auth/start?redirect_uri={}&state={}&code_challenge={}",
        api_base.trim_end_matches('/'),
        urlencoding::encode(&redirect),
        urlencoding::encode(&state),
        urlencoding::encode(&code_challenge),
    );

    let handle = app.clone();
    let expected_state = state.clone();
    std::thread::spawn(move || {
        let _ = listener.set_nonblocking(true);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);
        loop {
            if std::time::Instant::now() > deadline {
                let _ = handle.emit_to(
                    MAIN,
                    AUTH_EVENT,
                    serde_json::json!({ "state": expected_state.clone(), "error": "Sign-in timed out." }),
                );
                return;
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                    let mut buf = [0u8; 8192];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buf[..n]);
                    let target = request
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .unwrap_or("");
                    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
                    let token = query_param(query, "token");
                    let returned_state = query_param(query, "state");

                    let page = "<!doctype html><meta charset=\"utf-8\"><title>Tempo</title>\
                        <body style=\"margin:0;height:100vh;display:grid;place-items:center;\
                        background:#12110f;color:#f2ede3;font-family:system-ui,sans-serif\">\
                        <div style=\"text-align:center\"><h1 style=\"font-size:20px;margin:0 0 8px\">Tempo</h1>\
                        <p style=\"color:#a8a29a;margin:0\">You can close this tab and return to the app.</p></div>\
                        <script>history.replaceState({}, \"\", \"/callback\");</script></body>";
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nPragma: no-cache\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        page.len(),
                        page
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();

                    if returned_state.as_deref() != Some(expected_state.as_str()) {
                        let _ = handle.emit_to(
                            MAIN,
                            AUTH_EVENT,
                            serde_json::json!({ "state": returned_state, "error": "Sign-in state mismatch." }),
                        );
                        return;
                    }
                    match token {
                        Some(token) if !token.is_empty() => {
                            let _ = handle.emit_to(
                                MAIN,
                                AUTH_EVENT,
                                serde_json::json!({ "state": expected_state.clone(), "token": token }),
                            );
                        }
                        _ => {
                            let _ = handle.emit_to(
                                MAIN,
                                AUTH_EVENT,
                                serde_json::json!({ "state": expected_state.clone(), "error": "No sign-in token received." }),
                            );
                        }
                    }
                    return;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                }
                Err(_) => {
                    let _ = handle.emit_to(
                        MAIN,
                        AUTH_EVENT,
                        serde_json::json!({ "state": expected_state.clone(), "error": "Sign-in listener failed." }),
                    );
                    return;
                }
            }
        }
    });

    // Open the browser only after the listener thread is accepting, so a fast
    // redirect cannot arrive before we are ready to handle it.
    open::that_detached(&url).map_err(|e| format!("Could not open the browser: {e}"))?;

    Ok(serde_json::json!({ "port": port, "url": url }))
}

/// Progress `0..=1` for a live block, or a negative value to clear the bar.
#[tauri::command]
fn set_taskbar_progress(app: tauri::AppHandle, progress: f64, paused: bool) {
    #[cfg(windows)]
    {
        if let Some(window) = app.get_webview_window(MAIN) {
            if let Ok(hwnd) = window.hwnd() {
                if let Some(handle) = app.try_state::<platform::TaskbarHandle>() {
                    let flag = if progress < 0.0 { 0 } else if paused { 2 } else { 1 };
                    let _ = handle.0.send((hwnd.0 as isize, progress, flag));
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, progress, paused);
    }
}

/// Poll the Windows idle timer and broadcast it; the UI decides whether to act.
#[cfg(windows)]
fn start_idle_monitor(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(5));
        let idle = platform::idle_seconds();
        let _ = app.emit_to(MAIN, "tempo://idle", serde_json::json!({ "idleSeconds": idle }));
    });
}

/// Earlier builds registered a service worker on `tauri.localhost`, which
/// serves cached pre-upgrade assets and can prevent a new bundle from running.
/// The app itself cannot repair that (its code is the stale one), so drop the
/// registration from the shell and reload once. A version marker makes this a
/// once-per-upgrade repair instead of running on every launch.
fn drop_stale_service_worker(app: &tauri::AppHandle) {
    let version = app.package_info().version.to_string();
    let marker = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("sw-repair-version"));
    if let Some(path) = &marker {
        if let Ok(previous) = std::fs::read_to_string(path) {
            if previous.trim() == version {
                return;
            }
        }
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(2));
        if let Some(window) = handle.get_webview_window(MAIN) {
            let eval = window.eval(
                r#"(async () => {
  if (!('serviceWorker' in navigator)) return;
  if (sessionStorage.getItem('tempo-sw-repaired') === '1') return;
  const regs = await navigator.serviceWorker.getRegistrations();
  let dirty = regs.length > 0;
  await Promise.all(regs.map((r) => r.unregister()));
  if (window.caches) {
    const keys = await caches.keys();
    dirty = dirty || keys.length > 0;
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  if (!dirty) return;
  sessionStorage.setItem('tempo-sw-repaired', '1');
  location.reload();
})().catch(() => {});"#,
            );
            if eval.is_ok() {
                if let Some(path) = &marker {
                    if let Some(parent) = path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    let _ = std::fs::write(path, version);
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The single-instance plugin must be registered first.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        // Persist geometry only: restoring visibility would launch the app
        // hidden to the tray and show the mini widget unasked. The mini window
        // is fixed-size and placed per-monitor, so it is not tracked at all.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .with_denylist(&[MINI])
                .build(),
        )
        // "Start on login" support.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // Native OS notifications (session complete).
        .plugin(tauri_plugin_notification::init())
        // Global hotkey (Ctrl+Shift+Space) toggles the window.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            set_tray_tooltip,
            show_main_window,
            hide_mini_window,
            blocking_supported,
            idle_supported,
            start_desktop_auth,
            desktop_auth_load,
            desktop_auth_save,
            desktop_auth_clear,
            set_taskbar_progress,
            blocking::apply_block,
            blocking::clear_block,
            blocking::block_helper_installed,
            blocking::remove_block_helper
        ])
        .setup(|app| {
            // Keep a release warning/error log so failures (e.g. a hotkey
            // already owned by another app) are diagnosable in production.
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Info
                    } else {
                        log::LevelFilter::Warn
                    })
                    .build(),
            )?;

            // The mini window is created lazily on first use; a failure there
            // must never prevent the main app from starting.
            // One-time upgrade repair for profiles left with a cached worker.
            drop_stale_service_worker(app.handle());

            // Remove any block left behind by a crash / forced quit.
            blocking::clear_stale(false);

            #[cfg(windows)]
            {
                app.manage(platform::spawn_taskbar());
                start_idle_monitor(app.handle().clone());
            }

            // --- System tray ---
            let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
            let show_i = MenuItem::with_id(app, "show", "Open Tempo", true, None::<&str>)?;
            let mini_i = CheckMenuItem::with_id(
                app,
                "mini",
                "Show mini timer",
                true,
                false,
                None::<&str>,
            )?;
            let toggle_i = MenuItem::with_id(app, "toggle", "Start / Pause", true, None::<&str>)?;
            let skip_i = MenuItem::with_id(app, "skip", "Skip to break", true, None::<&str>)?;
            let autostart_i = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start on login",
                true,
                autostart_on,
                None::<&str>,
            )?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&show_i, &mini_i, &sep1, &toggle_i, &skip_i, &sep2, &autostart_i, &quit_i],
            )?;

            let mini_handle = mini_i.clone();
            let autostart_handle = autostart_i.clone();
            app.manage(MiniMenuItem(std::sync::Mutex::new(Some(mini_i.clone()))));

            TrayIconBuilder::with_id(TRAY_ID)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Tempo")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => show_main(app),
                    "mini" => {
                        // Create on first use. A failure is logged and ignored so
                        // the rest of the app keeps working.
                        if app.get_webview_window(MINI).is_none() {
                            if let Err(e) = build_mini_window(app) {
                                log::error!("Could not create mini window: {e}");
                                return;
                            }
                        }
                        if let Some(window) = app.get_webview_window(MINI) {
                            let visible = window.is_visible().unwrap_or(false);
                            if visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                            }
                            let _ = mini_handle.set_checked(!visible);
                        }
                    }
                    "toggle" => {
                        let _ = app.emit_to(
                            MAIN,
                            "tempo://command",
                            serde_json::json!({ "action": "toggle" }),
                        );
                    }
                    "skip" => {
                        let _ = app.emit_to(
                            MAIN,
                            "tempo://command",
                            serde_json::json!({ "action": "skip" }),
                        );
                    }
                    "autostart" => {
                        let manager = app.autolaunch();
                        let enabled = manager.is_enabled().unwrap_or(false);
                        let _ = if enabled {
                            manager.disable()
                        } else {
                            manager.enable()
                        };
                        let _ = autostart_handle.set_checked(!enabled);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // --- Global hotkey ---
            // Another app may already own the combination; the app still works
            // from the tray, so a failed registration must not abort startup.
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            if let Err(error) = app.global_shortcut().register(shortcut) {
                log::warn!("Global shortcut unavailable: {error}");
            }

            Ok(())
        })
        // Closing the main window hides it to the tray instead of quitting.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == MAIN {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Clear any applied website block when the app actually exits.
            if let tauri::RunEvent::Exit = event {
                blocking::clear_stale(true);
            }
        });
}
