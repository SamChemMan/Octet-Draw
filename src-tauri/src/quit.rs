// Quit from the Dock, the app switcher, a logout or a shutdown (REL-2). On the Mac these go to the app delegate's
// applicationShouldTerminate:, which tao 0.37 does not have, so Octet adds it to tao's delegate class at start. While
// the drawing has unsaved changes (the page tells set_edited), Octet stops the quit and the page asks to save them,
// as Octet > Quit does. A logout or a shutdown stops too, and the user starts it again after the question. Octet's own
// Quit and Close Window close the window, and Octet ends without a call to the delegate.
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};

use tauri::{AppHandle, Manager};

static EDITED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_edited(edited: bool) {
    EDITED.store(edited, Relaxed);
}

// Before the question about unsaved changes: the window comes back from the Dock or from Hide, so the user sees it.
pub fn front(app: &AppHandle) {
    if EDITED.load(Relaxed) {
        for window in app.webview_windows().values() {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg(target_os = "macos")]
pub fn install(app: &AppHandle) {
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use std::sync::OnceLock;
    use tauri::Emitter;

    static APP: OnceLock<AppHandle> = OnceLock::new();
    // NSTerminateCancel (0) with unsaved changes, else NSTerminateNow (1). The page gets Quit after AppKit's call.
    extern "C" fn should_terminate(_: &AnyObject, _: Sel, _: *mut AnyObject) -> usize {
        let Some(app) = APP.get().filter(|_| EDITED.load(Relaxed)).cloned() else { return 1 };
        std::thread::spawn(move || {
            front(&app);
            app.emit_to("main", "menu", "quit")
        });
        0
    }
    let _ = APP.set(app.clone());
    let Some(class) = AnyClass::get(c"TaoAppDelegateParent") else { return };
    // SAFETY: the function takes the method's arguments (the delegate, the selector, the NSApplication) and returns
    // an NSUInteger, as the type string "Q@:@" says.
    unsafe {
        let imp: Imp = std::mem::transmute(should_terminate as extern "C" fn(&AnyObject, Sel, *mut AnyObject) -> usize);
        objc2::ffi::class_addMethod(class as *const AnyClass as *mut AnyClass, objc2::sel!(applicationShouldTerminate:), imp, c"Q@:@".as_ptr());
    }
}

#[cfg(not(target_os = "macos"))]
pub fn install(_: &AppHandle) {}
