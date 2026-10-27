// Quit from the Dock, the app switcher, a logout or a restart (REL-2). On the Mac these go to the app delegate's
// applicationShouldTerminate:, which tao 0.37 does not have, so Octet adds it to tao's delegate class at start. While
// the drawing has unsaved changes (the page tells set_edited), the quit waits (NSTerminateLater, as a document app's
// does) and the page asks to save them, as Octet > Quit does. Save or Don't Save closes the window and the quit goes
// on, so a logout or a restart goes on too. Cancel stops it (quit_answer). Octet's own Quit and Close Window close
// the window, and Octet ends without a call to the delegate.
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering::Relaxed};

use tauri::{AppHandle, Manager};

static EDITED: AtomicBool = AtomicBool::new(false);
// A quit from outside Octet: 0 none, 1 waiting for the page's answer, 2 answered yes (AppKit ends Octet).
static QUIT: AtomicU8 = AtomicU8::new(0);

#[tauri::command]
pub fn set_edited(edited: bool) {
    EDITED.store(edited, Relaxed);
}

// The page kept the drawing (Cancel, or a save that did not happen): a quit that waits stops.
#[tauri::command]
pub fn quit_answer(quit: bool) {
    answer(quit);
}

// The answer to a quit that waits, if one does. The page answers yes by closing its window (main.rs).
pub fn answer(quit: bool) {
    if QUIT.compare_exchange(1, if quit { 2 } else { 0 }, Relaxed, Relaxed).is_err() {
        return;
    }
    // AppKit takes the answer on the main thread. It goes on the main queue, so it runs after the event that
    // brought it, never inside tao's event handler: a yes ends Octet through applicationWillTerminate:, which calls
    // that handler.
    #[cfg(target_os = "macos")]
    dispatch2::DispatchQueue::main().exec_async(move || {
        if let Some(mtm) = objc2::MainThreadMarker::new() {
            objc2_app_kit::NSApplication::sharedApplication(mtm).replyToApplicationShouldTerminate(quit);
        }
    });
}

// Whether AppKit ends Octet after a yes: Tauri must not end it first (main.rs).
pub fn ending() -> bool {
    QUIT.load(Relaxed) == 2
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
    use objc2_app_kit::NSApplicationTerminateReply;
    use std::sync::OnceLock;
    use tauri::Emitter;

    static APP: OnceLock<AppHandle> = OnceLock::new();
    // NSTerminateNow with no unsaved changes. Else NSTerminateLater, and the page gets Quit after AppKit's call.
    extern "C" fn should_terminate(_: &AnyObject, _: Sel, _: *mut AnyObject) -> NSApplicationTerminateReply {
        let Some(app) = APP.get().filter(|_| EDITED.load(Relaxed)).cloned() else { return NSApplicationTerminateReply::TerminateNow };
        QUIT.store(1, Relaxed);
        std::thread::spawn(move || {
            front(&app);
            app.emit_to("main", "menu", "quit")
        });
        NSApplicationTerminateReply::TerminateLater
    }
    let _ = APP.set(app.clone());
    let Some(class) = AnyClass::get(c"TaoAppDelegateParent") else { return };
    type Method = extern "C" fn(&AnyObject, Sel, *mut AnyObject) -> NSApplicationTerminateReply;
    // SAFETY: the function takes the method's arguments (the delegate, the selector, the NSApplication) and returns
    // an NSUInteger (NSApplicationTerminateReply is one), as the type string "Q@:@" says. class_addMethod adds it
    // only if tao's class has no such method, and never replaces one.
    unsafe {
        let imp: Imp = std::mem::transmute(should_terminate as Method);
        objc2::ffi::class_addMethod(class as *const AnyClass as *mut AnyClass, objc2::sel!(applicationShouldTerminate:), imp, c"Q@:@".as_ptr());
    }
}

#[cfg(not(target_os = "macos"))]
pub fn install(_: &AppHandle) {}
