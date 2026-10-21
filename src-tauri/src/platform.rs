//! Windows-native helpers: taskbar progress and user-idle detection.
//! Everything here is `cfg(windows)`-gated; the rest of the app is portable.

#![cfg(windows)]

use std::sync::mpsc::{channel, Sender};

use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::Shell::{ITaskbarList3, TaskbarList, TBPF_NOPROGRESS, TBPF_NORMAL, TBPF_PAUSED};

/// A channel into the COM thread that owns the taskbar interface.
/// `(hwnd as isize, progress 0..=1 or -1 to clear, state 0=off 1=normal 2=paused)`
pub struct TaskbarHandle(pub Sender<(isize, f64, i32)>);

/// Spawn the taskbar thread. `ITaskbarList3` is apartment-threaded, so it is
/// created and used entirely on one dedicated STA thread; the app talks to it
/// only through the returned channel.
pub fn spawn_taskbar() -> TaskbarHandle {
    let (tx, rx) = channel::<(isize, f64, i32)>();

    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let list: windows::core::Result<ITaskbarList3> =
            CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER);
        let Ok(list) = list else {
            return;
        };
        let _ = list.HrInit();

        while let Ok((raw, progress, flag)) = rx.recv() {
            let hwnd = HWND(raw as *mut core::ffi::c_void);
            let state = match flag {
                0 => TBPF_NOPROGRESS,
                2 => TBPF_PAUSED,
                _ => TBPF_NORMAL,
            };
            let _ = list.SetProgressState(hwnd, state);
            if progress >= 0.0 {
                let _ = list.SetProgressValue(hwnd, (progress * 1000.0).round() as u64, 1000);
            }
        }
    });

    TaskbarHandle(tx)
}

/// Seconds since the last keyboard/mouse input. Screen lock also increases this.
pub fn idle_seconds() -> u64 {
    unsafe {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut info).as_bool() {
            let now = GetTickCount();
            let idle_ms = now.wrapping_sub(info.dwTime);
            (idle_ms / 1000) as u64
        } else {
            0
        }
    }
}
