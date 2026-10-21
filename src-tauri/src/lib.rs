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
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_main(app);
        }
    }
}

/// Create the small always-on-top timer widget, hidden until toggled.
fn build_mini_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    const W: f64 = 284.0;
    const H: f64 = 68.0;

    let mut x = 48.0;
    let mut y = 48.0;
    if let Ok(Some(monitor)) = app.primary_monitor() {
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
/// registration from the shell and reload once. No-op for clean installs.
fn drop_stale_service_worker(app: &tauri::AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(2));
        if let Some(window) = handle.get_webview_window(MAIN) {
            let _ = window.eval(
                r#"(async () => {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  if (regs.length === 0) return;
  await Promise.all(regs.map((r) => r.unregister()));
  if (window.caches) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  location.reload();
})().catch(() => {});"#,
            );
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
            set_taskbar_progress,
            blocking::apply_block,
            blocking::clear_block,
            blocking::block_helper_installed,
            blocking::remove_block_helper
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            build_mini_window(app.handle())?;

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
