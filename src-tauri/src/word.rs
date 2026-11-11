// Edit Picture from Word on the Mac (plan step 2 and 3, decision 0023's object window). Word for Mac runs no OLE
// servers, so Octet asks Word through Apple Events, on the user's command only (File > Edit Picture from Word, or the
// Service "Edit in Octet Draw"):
// - The picture selected in Word is copied to the clipboard, and paste's reader takes the CDXML from its PDF. The
//   user's clipboard is saved first and put back after.
// - A hidden bookmark marks the picture (or Word's cursor, for a new drawing). The object window opens on the drawing.
// - Update puts the new picture (Copy's PDF, with the CDXML in it) in the bookmark's place, at its own size, with the
//   old picture's alt text. Word pastes it into a document of its own first, then the picture goes into the user's
//   document in one step, so one Undo in Word puts the old picture back.
// - The bookmark stays in the document: making or removing one is an Undo step in Word of its own.
//
// The events go only to Word, by its bundle id. The scripts are fixed text; what changes goes in as arguments, never
// into the script. What Word gives is read as hostile: the PDF through paste's 64 MB limit and export's reader, the
// document's name through host_name.
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

use tauri::AppHandle;

use crate::clipboard::mac as clip;

// One borrow of the clipboard at a time, and one script at a time.
static BUSY: Mutex<()> = Mutex::new(());
static APP: OnceLock<AppHandle> = OnceLock::new();

// Edit Picture from Word: the selection's kind and the document's name, one a line. A picture is copied to the
// clipboard. "busy": Word's scripting gives missing values. Seen when a script started Word, which then stays hidden
// until it comes to the front once; a click in Word ends it.
const EDIT: &str = r#"on run argv
	if not (application id "com.microsoft.Word" is running) then return "none"
	tell application id "com.microsoft.Word"
		with timeout of 10 seconds
			if (count of documents) is 0 then return "none"
			set s to selection
			set n to name of document of s
			if n is missing value then return "busy"
			set k to selection type of s
			if k is selection inline shape then
				if (count of inline shapes of s) is not 1 then return "none"
				copy object (text object of inline shape 1 of s)
				return "picture" & linefeed & n
			end if
			if k is selection ip then return "new" & linefeed & n
		end timeout
	end tell
	return "none"
end run"#;

// The hidden bookmark (argument 1) on the selected picture, or at the cursor (argument 2: "picture" or "new"), if the
// selection is still that.
const MARK: &str = r#"on run argv
	set b to item 1 of argv
	set k to item 2 of argv
	tell application id "com.microsoft.Word"
		with timeout of 10 seconds
			set s to selection
			if k is "picture" and (selection type of s is selection inline shape) then
				set r to text object of inline shape 1 of s
			else if k is "new" and (selection type of s is selection ip) then
				set r to text object of s
			else
				return "none"
			end if
			make new bookmark at (document of s) with properties {name:b, text object:r}
		end timeout
	end tell
	return "ok"
end run"#;

// Update: the PDF on the clipboard replaces the picture at the bookmark (argument 1), in the document that has it.
// Argument 2 "1": the picture is in the document. A new drawing's bookmark stays empty at the cursor, and its picture
// is the character after it. No picture there (deleted, or text typed in its place): "gone", so no text is replaced.
// Only the picture is replaced, so text typed into the bookmark next to it stays. Returns the document's name, "gone"
// or "busy". The picture stays selected if it was. Each command waits 10 s for Word at most (a dialog open in Word),
// so the clipboard is never borrowed for long.
const UPDATE: &str = r#"on run argv
	set b to item 1 of argv
	set placed to (item 2 of argv) is "1"
	if not (application id "com.microsoft.Word" is running) then return "gone"
	tell application id "com.microsoft.Word"
		with timeout of 10 seconds
			set n to missing value
			repeat with i from 1 to (count of documents)
				set x to document i
				if (name of x) is missing value then return "busy"
				if exists bookmark b of x then
					set n to name of x
					exit repeat
				end if
			end repeat
			if n is missing value then return "gone"
			set d to document n
			set m to bookmark b of d
			if m is missing value then return "busy"
			set r to text object of m
			set at0 to start of bookmark of m
			if placed and (empty of m) then set r to create range d start at0 end (at0 + 1)
			set alt to ""
			try
				set alt to alternative text of inline shape 1 of r
				if placed then set r to text object of inline shape 1 of r
			on error
				if placed then return "gone"
			end try
			set s to selection
			set picked to (name of document of s is n) and (selection start of s is start of content of r) and (selection end of s is end of content of r)
			set t to make new document
			try
				paste object (text object of t)
				set p to inline shape 1 of t
				set alternative text of p to alt
				make new bookmark at t with properties {name:b, text object:(text object of p)}
				set formatted text of r to formatted text of (text object of bookmark b of t)
			on error e number k
				close t saving no
				error e number k
			end try
			close t saving no
			if picked then
				set m to bookmark b of d
				if empty of m then
					select (create range d start at0 end (at0 + 1))
				else
					select (text object of m)
				end if
			end if
			return n
		end timeout
	end tell
end run"#;

// Close and Return: Word comes to the front.
const BACK: &str = r#"if application id "com.microsoft.Word" is running then tell application id "com.microsoft.Word" to activate"#;

#[derive(Debug, PartialEq, Eq)]
pub enum Fail {
    Denied, // the user did not allow Octet to control Word (System Settings > Privacy & Security > Automation)
    Gone,   // the document is closed, Word quit, or the picture is no longer there
    Busy,   // Word did not answer
    Failed,
}

// What Edit Picture from Word found: the document's name, the drawing (empty for a new one), whether it is a picture
// in the document already, and its bookmark.
pub struct Found {
    pub host: String,
    pub oct: String,
    pub placed: bool,
    pub mark: String,
}

// The script's answer, or why it failed, from the error number osascript gives last: errAEEventNotPermitted (-1743),
// errAETimeout (-1712), and the program not running (procNotFound -600, connectionInvalid -609).
fn run(script: &str, args: &[&str]) -> Result<String, Fail> {
    let mut child = Command::new("/usr/bin/osascript").arg("-").args(args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|_| Fail::Failed)?;
    child.stdin.take().ok_or(Fail::Failed)?.write_all(script.as_bytes()).map_err(|_| Fail::Failed)?;
    let out = child.wait_with_output().map_err(|_| Fail::Failed)?;
    if out.status.success() {
        return Ok(String::from_utf8_lossy(&out.stdout).trim_end().to_string());
    }
    let err = String::from_utf8_lossy(&out.stderr);
    Err(match number(&err) {
        Some(-1743) => Fail::Denied,
        Some(-1712) => Fail::Busy,
        Some(-600 | -609) => Fail::Gone,
        _ => {
            // The crash log on this computer (crashlog.rs), as Windows' objects log theirs.
            if let Some(app) = APP.get() {
                let _ = crate::crashlog::log_error(app.clone(), format!("Word: {}", err.trim()), false);
            }
            Fail::Failed
        }
    })
}

// The error number at the end of osascript's message: "…: execution error: Not authorized … (-1743)".
fn number(err: &str) -> Option<i32> {
    let e = err.trim_end();
    let open = e.strip_suffix(')')?.rfind('(')?;
    e[open + 1..e.len() - 1].parse().ok()
}

// A bookmark name of Octet's: hidden (it starts with _), 40 characters at most, letters, digits and _ only, and new
// each time, so a bookmark a crash left behind is never taken for another.
fn new_mark() -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos() as u64);
    format!("_Octet_{:016x}", t ^ ((std::process::id() as u64) << 48))
}

const WORD: &str = "com.microsoft.Word";

// Word is running.
fn running() -> bool {
    objc2::rc::autoreleasepool(|_| objc2_app_kit::NSRunningApplication::runningApplicationsWithBundleIdentifier(&objc2_foundation::NSString::from_str(WORD)).count() > 0)
}

// Edit Picture from Word, on a thread of its own: the selected picture's drawing (None: nothing Octet can edit).
fn find() -> Result<Option<Found>, Fail> {
    // Word closed or not installed: a beep, with no Apple Event and no clipboard borrowed.
    if !running() {
        return Ok(None);
    }
    let _one = BUSY.lock().unwrap_or_else(|e| e.into_inner());
    let pb = clip::general();
    let (saved, before) = (clip::save(&pb), pb.changeCount());
    let answer = run(EDIT, &[]);
    // Word copied the picture: paste's reader takes it, and the user's clipboard goes back. It goes back even if the
    // clipboard changed again while Octet read it: Word may write twice, and the user rarely copies in that moment.
    let copied = pb.changeCount() != before;
    let oct = if copied { clip::drawing(&pb) } else { None };
    if copied {
        clip::restore(&pb, &saved);
    }
    let answer = answer?;
    let (kind, host) = answer.split_once('\n').unwrap_or((answer.as_str(), ""));
    let (oct, placed) = match kind {
        "picture" => match oct {
            Some(o) => (o, true),
            None => return Ok(None),
        },
        "new" => (String::new(), false),
        "busy" => return Err(Fail::Busy),
        _ => return Ok(None),
    };
    let mark = new_mark();
    if run(MARK, &[&mark, kind])? != "ok" {
        return Ok(None);
    }
    Ok(Some(Found { host: crate::ole::host_name(host), oct, placed, mark }))
}

// Update: `pdf` replaces the picture at the bookmark `mark`. The document's name (it changes with Save As), else why
// not. The PDF goes on the clipboard alone, marked transient so clipboard managers skip it
// (http://nspasteboard.org), and the user's clipboard goes back after.
pub fn put(mark: &str, placed: bool, pdf: &[u8]) -> Result<String, Fail> {
    let _one = BUSY.lock().unwrap_or_else(|e| e.into_inner());
    let pb = clip::general();
    let saved = clip::save(&pb);
    if clip::write(&pb, &[(crate::clipboard::PDF, pdf.to_vec()), ("org.nspasteboard.TransientType", Vec::new())]).is_err() {
        clip::restore(&pb, &saved);
        return Err(Fail::Failed);
    }
    let ours = pb.changeCount();
    let answer = run(UPDATE, &[mark, if placed { "1" } else { "0" }]);
    if pb.changeCount() == ours {
        clip::restore(&pb, &saved);
    }
    match answer?.as_str() {
        "gone" => Err(Fail::Gone),
        "busy" => Err(Fail::Busy),
        name => Ok(crate::ole::host_name(name)),
    }
}

// Close and Return to <document>.
pub fn back() {
    let _ = run(BACK, &[]);
}

// File > Edit Picture from Word and the Service: an object window for the picture selected in Word, or for a new
// drawing at Word's cursor. A selection that is neither, or a picture with no drawing in it, gives a beep.
pub fn edit(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match tauri::async_runtime::spawn_blocking(find).await.unwrap_or(Err(Fail::Failed)) {
            Ok(Some(found)) => crate::objects::open_word(&app, found).await,
            Ok(None) => beep(&app),
            Err(f) => tell(&app, &f, None),
        }
    });
}

#[tauri::command]
pub fn word_edit(app: AppHandle) {
    edit(&app);
}

fn beep(app: &AppHandle) {
    let _ = app.run_on_main_thread(|| objc2_app_kit::NSBeep());
}

// Why Octet cannot edit or update the picture, as the page and the alert say it. `host`: the document, for Update.
pub fn message(f: &Fail, host: Option<&str>) -> String {
    match (f, host) {
        (Fail::Denied, _) => "Octet Draw is not allowed to control Microsoft Word.".into(),
        (Fail::Busy, _) => "Microsoft Word does not answer. Click in the Word document, then try again.".into(),
        (Fail::Gone, Some(h)) => format!("{h} is closed. Save a copy to keep this drawing."),
        (_, Some(h)) => format!("Octet cannot update {h}. Try again."),
        (_, None) => "Octet cannot open this picture from Word.".into(),
    }
}

// An alert. When the user did not allow Octet to control Word, its button opens System Settings at Automation.
pub fn tell(app: &AppHandle, f: &Fail, host: Option<&str>) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let text = match f {
        Fail::Denied => format!("{} Allow it in Privacy & Security > Automation.", message(f, host)),
        _ => message(f, host),
    };
    let dialog = app.dialog().message(text).title(crate::ole::APP).kind(MessageDialogKind::Warning);
    if *f != Fail::Denied {
        return dialog.show(|_| {});
    }
    dialog.buttons(MessageDialogButtons::OkCancelCustom("Open System Settings".into(), "Cancel".into())).show(|open| {
        if open {
            let _ = crate::open_external("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation");
        }
    });
}

// The Service "Edit in Octet Draw" (NSServices in Info.plist): macOS starts Octet if it is not running, and calls
// editInOctet:userData:error: on Tao's application delegate, which is the services provider.
pub fn install(app: &AppHandle) {
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};

    extern "C" fn service(_: &AnyObject, _: Sel, _: *mut AnyObject, _: *mut AnyObject, _: *mut *mut AnyObject) {
        if let Some(app) = APP.get() {
            edit(app);
        }
    }
    let _ = APP.set(app.clone());
    let (Some(class), Some(mtm)) = (AnyClass::get(c"TaoAppDelegateParent"), objc2::MainThreadMarker::new()) else { return };
    type Method = extern "C" fn(&AnyObject, Sel, *mut AnyObject, *mut AnyObject, *mut *mut AnyObject);
    let ns = objc2_app_kit::NSApplication::sharedApplication(mtm);
    // SAFETY: the function takes the method's arguments (the delegate, the selector, the pasteboard, the user data and
    // the error out-pointer) and returns nothing, as the type string "v@:@@^@" says. class_addMethod never replaces a
    // method tao has. The provider is the application's own delegate, which lives as long as the application.
    unsafe {
        let imp: Imp = std::mem::transmute(service as Method);
        objc2::ffi::class_addMethod(class as *const AnyClass as *mut AnyClass, objc2::sel!(editInOctet:userData:error:), imp, c"v@:@@^@".as_ptr());
        let delegate: Option<objc2::rc::Retained<AnyObject>> = objc2::msg_send![&*ns, delegate];
        if let Some(d) = delegate {
            ns.setServicesProvider(Some(&d));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_numbers() {
        assert_eq!(number("85:96: execution error: Not authorized to send Apple events to Microsoft Word. (-1743)\n"), Some(-1743));
        assert_eq!(number("execution error: Microsoft Word got an error: AppleEvent timed out. (-1712)"), Some(-1712));
        assert_eq!(number("no number here"), None);
        assert_eq!(number("(x)"), None);
    }

    // Word's rules for a bookmark name: 40 characters at most, letters, digits and _; hidden when it starts with _.
    #[test]
    fn bookmark_names() {
        let m = new_mark();
        assert!(m.starts_with("_Octet_") && m.len() <= 40, "{m}");
        assert!(m.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'));
    }

    // Apple Events go to Word only, by its bundle id.
    #[test]
    fn scripts_name_only_word() {
        for s in [EDIT, MARK, UPDATE, BACK] {
            assert!(!s.contains("tell application \""), "by bundle id only");
            let apps: Vec<&str> = s.match_indices("application id \"").map(|(k, _)| &s[k + 16..k + 16 + s[k + 16..].find('"').unwrap()]).collect();
            assert!(apps.iter().all(|a| *a == WORD), "{apps:?}");
        }
    }

    #[test]
    fn messages() {
        assert_eq!(message(&Fail::Gone, Some("Report.docx")), "Report.docx is closed. Save a copy to keep this drawing.");
        assert_eq!(message(&Fail::Failed, Some("Report.docx")), "Octet cannot update Report.docx. Try again.");
        assert_eq!(message(&Fail::Denied, None), "Octet Draw is not allowed to control Microsoft Word.");
    }
}
