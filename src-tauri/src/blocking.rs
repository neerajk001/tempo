//! Website blocking via the Windows `hosts` file.
//!
//! First use installs a one-time helper (a single UAC prompt):
//!   - a worker script at `C:\ProgramData\Tempo\tempo-block.ps1` (admin-only),
//!   - a scheduled task `TempoBlock` that runs it with highest privileges.
//!
//! After that, applying/clearing the block is silent: the app writes a plain
//! domain list to `%LOCALAPPDATA%\Tempo\block.txt` and triggers the task via
//! `schtasks /Run`, which needs no elevation. The worker re-validates every
//! domain before touching the hosts file, and a stale block is cleared on
//! launch/exit.
//!
//! Non-Windows builds compile to no-ops.

#[cfg(windows)]
mod win {
    use std::os::windows::process::CommandExt;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};

    const MARK_BEGIN: &str = "# TEMPO-BLOCK BEGIN";
    const TASK_NAME: &str = "TempoBlock";
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    /// The privileged worker. Reads the domain list and rewrites the hosts block.
    fn worker_script() -> &'static str {
        r#"$ErrorActionPreference = 'Stop'
$hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$blockFile = Join-Path $env:LOCALAPPDATA 'Tempo\block.txt'
$begin = '# TEMPO-BLOCK BEGIN'
$end = '# TEMPO-BLOCK END'
$domains = @()
if (Test-Path -LiteralPath $blockFile) {
  $domains = Get-Content -LiteralPath $blockFile |
    ForEach-Object { $_.Trim().ToLower() } |
    Where-Object { $_ -match '^[a-z0-9.-]+$' -and $_ -match '\.' -and $_.Length -le 253 } |
    Sort-Object -Unique
}
$content = Get-Content -Raw -LiteralPath $hosts
if ($null -eq $content) { $content = '' }
$pattern = [regex]::Escape($begin) + '(?s).*?' + [regex]::Escape($end)
$content = [regex]::Replace($content, $pattern, '').TrimEnd()
if ($domains.Count -gt 0) {
  $lines = @($begin)
  foreach ($d in $domains) {
    $lines += "0.0.0.0 $d"
    $lines += "0.0.0.0 www.$d"
  }
  $lines += $end
  $content = $content + "`r`n" + ($lines -join "`r`n") + "`r`n"
} else {
  $content = $content + "`r`n"
}
Set-Content -LiteralPath $hosts -Value $content -Encoding ASCII
ipconfig /flushdns | Out-Null
"#
    }

    fn hosts_path() -> PathBuf {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        PathBuf::from(root)
            .join("System32")
            .join("drivers")
            .join("etc")
            .join("hosts")
    }

    fn block_file() -> PathBuf {
        let local =
            std::env::var("LOCALAPPDATA").unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into());
        PathBuf::from(local).join("Tempo").join("block.txt")
    }

    /// Keep only plausible domain names; strip scheme, path and `www.`.
    fn sanitize(domains: &[String]) -> Vec<String> {
        let mut out: Vec<String> = domains
            .iter()
            .filter_map(|raw| {
                let d = raw
                    .trim()
                    .to_lowercase()
                    .trim_start_matches("https://")
                    .trim_start_matches("http://")
                    .split('/')
                    .next()
                    .unwrap_or("")
                    .trim_start_matches("www.")
                    .trim_end_matches('.')
                    .to_string();
                let valid = !d.is_empty()
                    && d.contains('.')
                    && d.len() <= 253
                    && d.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
                if valid {
                    Some(d)
                } else {
                    None
                }
            })
            .collect();
        out.sort();
        out.dedup();
        out
    }

    fn hosts_has_block() -> bool {
        std::fs::read_to_string(hosts_path())
            .map(|c| c.contains(MARK_BEGIN))
            .unwrap_or(false)
    }

    fn write_block_file(domains: &[String]) -> Result<(), String> {
        let path = block_file();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Could not create data dir: {e}"))?;
        }
        std::fs::write(&path, domains.join("\r\n")).map_err(|e| format!("Could not write block list: {e}"))
    }

    pub fn helper_installed() -> bool {
        Command::new("schtasks")
            .args(["/Query", "/TN", TASK_NAME])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    fn run_task() -> Result<(), String> {
        let status = Command::new("schtasks")
            .args(["/Run", "/TN", TASK_NAME])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("Could not run the block task: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err("Could not run the block task.".into())
        }
    }

    /// Run a PowerShell body elevated (one UAC prompt).
    fn run_elevated(body: &str) -> Result<(), String> {
        let script_path = std::env::temp_dir().join("tempo-helper.ps1");
        std::fs::write(&script_path, body).map_err(|e| format!("Could not write helper: {e}"))?;

        let inner = format!(
            "$ErrorActionPreference='Stop'; Start-Process -FilePath powershell.exe -Verb RunAs -Wait \
             -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{}'",
            script_path.display()
        );

        let status = Command::new("powershell.exe")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &inner])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("Could not start helper: {e}"))?;

        if status.success() {
            Ok(())
        } else {
            Err("Permission denied or cancelled.".into())
        }
    }

    /// One-time elevated install: write the worker + register the task.
    fn install_helper() -> Result<(), String> {
        let setup = format!(
            r#"$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:ProgramData 'Tempo'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$worker = @'
{worker}
'@
Set-Content -LiteralPath (Join-Path $dir 'tempo-block.ps1') -Value $worker -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\ProgramData\Tempo\tempo-block.ps1"'
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName 'TempoBlock' -Action $action -Principal $principal -Force | Out-Null
"#,
            worker = worker_script()
        );
        run_elevated(&setup)?;
        if helper_installed() {
            Ok(())
        } else {
            Err("Helper did not install (cancelled or denied).".into())
        }
    }

    fn verify(expected: bool) -> Result<(), String> {
        for _ in 0..12 {
            std::thread::sleep(std::time::Duration::from_millis(250));
            if hosts_has_block() == expected {
                return Ok(());
            }
        }
        if expected {
            Err("Block did not apply.".into())
        } else {
            Err("Block did not clear.".into())
        }
    }

    pub fn apply(domains: Vec<String>) -> Result<(), String> {
        let cleaned = sanitize(&domains);
        if cleaned.is_empty() {
            return clear();
        }
        write_block_file(&cleaned)?;
        if !helper_installed() {
            install_helper()?;
        }
        run_task()?;
        verify(true)
    }

    pub fn clear() -> Result<(), String> {
        if !hosts_has_block() {
            let _ = write_block_file(&[]);
            return Ok(());
        }
        write_block_file(&[])?;
        if helper_installed() {
            run_task()?;
        } else {
            // No helper yet (e.g. an old block) — fall back to a one-time elevation.
            run_elevated(worker_script())?;
        }
        verify(false)
    }

    pub fn remove_helper() -> Result<(), String> {
        let script = r#"$ErrorActionPreference = 'SilentlyContinue'
Unregister-ScheduledTask -TaskName 'TempoBlock' -Confirm:$false
Remove-Item -Recurse -Force (Join-Path $env:ProgramData 'Tempo')
"#;
        run_elevated(script)
    }

    /// Clear a leftover block. `silent_only` skips the fallback elevation
    /// (used on exit so quitting never raises a UAC prompt).
    pub fn clear_stale(silent_only: bool) {
        if !hosts_has_block() {
            return;
        }
        if helper_installed() {
            let _ = write_block_file(&[]);
            let _ = run_task();
        } else if !silent_only {
            let _ = write_block_file(&[]);
            let _ = run_elevated(worker_script());
        }
    }
}

#[tauri::command]
pub fn apply_block(domains: Vec<String>) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::apply(domains)
    }
    #[cfg(not(windows))]
    {
        let _ = domains;
        Ok(())
    }
}

#[tauri::command]
pub fn clear_block() -> Result<(), String> {
    #[cfg(windows)]
    {
        win::clear()
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

#[tauri::command]
pub fn block_helper_installed() -> bool {
    #[cfg(windows)]
    {
        win::helper_installed()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
pub fn remove_block_helper() -> Result<(), String> {
    #[cfg(windows)]
    {
        win::remove_helper()
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

/// Best-effort cleanup of a leftover block; called at startup and on exit.
pub fn clear_stale(silent_only: bool) {
    #[cfg(windows)]
    {
        win::clear_stale(silent_only);
    }
    #[cfg(not(windows))]
    {
        let _ = silent_only;
    }
}
