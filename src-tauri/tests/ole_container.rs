// A small OLE container that drives Octet's real server (decision 0023), as Word does: from another process, through
// Windows' default handler. Windows only. Each test needs a built Octet and writes registry keys, so they are
// #[ignore]d and run in the Windows CI job (.github/workflows/platforms.yml, job "office-objects"):
//
//   cargo test --test ole_container -- --ignored --test-threads=1
//
// OCTET_EXE names the Octet to drive (a `tauri build --debug --no-bundle` build, which has its page). Without it, the
// test build's own octet.exe is used, whose window has no page; the COM calls work the same.
//
// GitHub's Windows machines run jobs elevated, and Windows ignores per-user (HKCU) local servers for elevated
// programs. So `registration` tries HKCU first and says what it found; the other tests then use HKLM on that
// throwaway machine if HKCU does not work there. On a person's computer (not elevated) HKCU is used, as the
// installer writes it.
#![cfg(windows)]
#![allow(non_snake_case)]

use std::cell::RefCell;
use std::path::PathBuf;
use std::process::Command;
use std::rc::Rc;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{E_NOINTERFACE, E_NOTIMPL, REGDB_E_CLASSNOTREG};
use windows::Win32::System::Com::StructuredStorage::{CreateILockBytesOnHGlobal, IPersistStorage, IStorage, ReadClassStg, StgCreateDocfileOnILockBytes, WriteClassStg};
use windows::Win32::System::Com::{IAdviseSink, IAdviseSink_Impl, IMoniker, FORMATETC, STGMEDIUM, STGM_CREATE, STGM_READ, STGM_READWRITE, STGM_SHARE_EXCLUSIVE, STGM_WRITE};
use windows::Win32::System::Ole::{
    IOleClientSite, IOleClientSite_Impl, IOleContainer, IOleObject, OleCreate, OleInitialize, OleLoad, OleRun, OleSave, OleSetContainedObject, OleUninitialize, OLECLOSE_NOSAVE,
    OLECLOSE, OLECLOSE_PROMPTSAVE, OLECLOSE_SAVEIFDIRTY, OLEGETMONIKER, OLEIVERB_SHOW, OLERENDER_DRAW, OLEWHICHMK,
};
use windows_core::{implement, Interface, Ref, Result, BOOL, GUID, PCWSTR};

const CLSID: GUID = GUID::from_u128(0x211EF98F_E45E_42C8_9D49_A10D2D394DB2);
const CLSID_TEXT: &str = "{211EF98F-E45E-42C8-9D49-A10D2D394DB2}";

fn octet() -> PathBuf {
    std::env::var_os("OCTET_EXE").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(env!("CARGO_BIN_EXE_octet")))
}

fn reg(args: &[&str]) -> bool {
    Command::new("reg").args(args).output().is_ok_and(|o| o.status.success())
}

fn query(key: &str) -> Option<String> {
    query_view(key, "/reg:64")
}

// `view`: "/reg:64" or "/reg:32", the registry view to read (64-bit Office reads one, 32-bit Office the other).
fn query_view(key: &str, view: &str) -> Option<String> {
    let out = Command::new("reg").args(["query", key, "/ve", view]).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    out.status.success().then(|| text.lines().find(|l| l.contains("REG_SZ")).map(|l| l.split("REG_SZ").nth(1).unwrap_or("").trim().to_string())).flatten()
}

// Octet writes its own keys (octet.exe --register-ole), as its start-up repair does.
fn register() {
    let status = Command::new(octet()).arg("--register-ole").status().expect("octet runs");
    assert!(status.success(), "--register-ole failed");
}

// The throwaway CI machine only: the same keys under HKLM, for an elevated harness.
fn register_machine() {
    for k in [format!("CLSID\\{CLSID_TEXT}"), "OctetDraw.Drawing".into(), "OctetDraw.Drawing.1".into()] {
        assert!(reg(&["copy", &format!("HKCU\\Software\\Classes\\{k}"), &format!("HKLM\\Software\\Classes\\{k}"), "/s", "/f"]), "copy {k} to HKLM");
    }
}

fn unregister_machine() {
    for k in [format!("CLSID\\{CLSID_TEXT}"), "OctetDraw.Drawing".into(), "OctetDraw.Drawing.1".into()] {
        let _ = reg(&["delete", &format!("HKLM\\Software\\Classes\\{k}"), "/f"]);
    }
}

fn storage() -> IStorage {
    // SAFETY: an in-memory compound file, freed on release.
    unsafe {
        let b = CreateILockBytesOnHGlobal(None, true).unwrap();
        StgCreateDocfileOnILockBytes(&b, STGM_CREATE | STGM_READWRITE | STGM_SHARE_EXCLUSIVE, 0).unwrap()
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain([0]).collect()
}

fn read_octet_stream(stg: &IStorage) -> Option<Vec<u8>> {
    let n = wide("Octet");
    // SAFETY: COM calls on a live storage; reads into a buffer of its own size.
    unsafe {
        let s = stg.OpenStream(PCWSTR(n.as_ptr()), None, STGM_READ | STGM_SHARE_EXCLUSIVE, 0).ok()?;
        let mut out = Vec::new();
        let mut buf = [0u8; 4096];
        loop {
            let mut got = 0u32;
            s.Read(buf.as_mut_ptr().cast(), buf.len() as u32, Some(&mut got)).ok().ok()?;
            if got == 0 {
                break;
            }
            out.extend_from_slice(&buf[..got as usize]);
        }
        Some(out)
    }
}

fn object_storage(oct: &[u8]) -> IStorage {
    let stg = storage();
    let n = wide("Octet");
    // SAFETY: COM calls on a live storage.
    unsafe {
        WriteClassStg(&stg, &CLSID).unwrap();
        let s = stg.CreateStream(PCWSTR(n.as_ptr()), STGM_CREATE | STGM_WRITE | STGM_SHARE_EXCLUSIVE, 0, 0).unwrap();
        if !oct.is_empty() {
            s.Write(oct.as_ptr().cast(), oct.len() as u32, None).ok().unwrap();
        }
    }
    stg
}

// The container's side: a client site and an advise sink that write down what the server calls, in order.
#[implement(IOleClientSite, IAdviseSink)]
struct Site {
    log: Rc<RefCell<Vec<String>>>,
    storage: IStorage,
    object: RefCell<Option<IPersistStorage>>,
}

impl IOleClientSite_Impl for Site_Impl {
    // As a container does: save the object into its storage (OleSave calls Save, then SaveCompleted).
    fn SaveObject(&self) -> Result<()> {
        self.log.borrow_mut().push("SaveObject".into());
        if let Some(p) = self.object.borrow().clone() {
            // SAFETY: COM calls on live objects.
            unsafe {
                OleSave(&p, &self.storage, true)?;
                p.SaveCompleted(None)?;
            }
        }
        Ok(())
    }
    fn GetMoniker(&self, _a: &OLEGETMONIKER, _w: &OLEWHICHMK) -> Result<IMoniker> {
        Err(E_NOTIMPL.into())
    }
    fn GetContainer(&self) -> Result<IOleContainer> {
        Err(E_NOINTERFACE.into())
    }
    fn ShowObject(&self) -> Result<()> {
        self.log.borrow_mut().push("ShowObject".into());
        Ok(())
    }
    fn OnShowWindow(&self, show: BOOL) -> Result<()> {
        self.log.borrow_mut().push(format!("OnShowWindow({})", show.as_bool()));
        Ok(())
    }
    fn RequestNewObjectLayout(&self) -> Result<()> {
        Err(E_NOTIMPL.into())
    }
}

impl IAdviseSink_Impl for Site_Impl {
    fn OnDataChange(&self, _f: *const FORMATETC, _m: *const STGMEDIUM) {
        self.log.borrow_mut().push("OnDataChange".into());
    }
    fn OnViewChange(&self, _aspect: u32, _lindex: i32) {
        self.log.borrow_mut().push("OnViewChange".into());
    }
    fn OnRename(&self, _mk: Ref<IMoniker>) {}
    fn OnSave(&self) {
        self.log.borrow_mut().push("OnSave".into());
    }
    fn OnClose(&self) {
        self.log.borrow_mut().push("OnClose".into());
    }
}

fn site(storage: IStorage) -> (IOleClientSite, Rc<RefCell<Vec<String>>>, windows_core::ComObject<Site>) {
    let log = Rc::new(RefCell::new(Vec::new()));
    let obj = windows_core::ComObject::new(Site { log: log.clone(), storage, object: RefCell::new(None) });
    (obj.to_interface(), log, obj)
}

fn with_ole<T>(f: impl FnOnce() -> T) -> T {
    // SAFETY: the test thread starts and ends OLE once.
    unsafe { OleInitialize(None).unwrap() };
    let out = f();
    // SAFETY: as above.
    unsafe { OleUninitialize() };
    out
}

fn octets_running() -> usize {
    let out = Command::new("tasklist").args(["/FI", "IMAGENAME eq octet.exe", "/NH"]).output().unwrap();
    String::from_utf8_lossy(&out.stdout).lines().filter(|l| l.to_ascii_lowercase().starts_with("octet.exe")).count()
}

// A container's thread keeps its messages moving while it waits, or Octet's calls to it would wait too.
fn pump_for(d: Duration) {
    use windows::Win32::UI::WindowsAndMessaging::{DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE};
    let end = Instant::now() + d;
    while Instant::now() < end {
        let mut msg = MSG::default();
        // SAFETY: this thread's own messages; MSG lives on the stack.
        unsafe {
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn wait(secs: u64, mut done: impl FnMut() -> bool) -> bool {
    let end = Instant::now() + Duration::from_secs(secs);
    while Instant::now() < end {
        if done() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    done()
}

// Runs a new object through OleCreate; on an elevated machine where HKCU does not count, again with HKLM.
fn create(site: &IOleClientSite, stg: &IStorage) -> (IOleObject, bool) {
    let try_once = || {
        let mut out: Option<IOleObject> = None;
        // SAFETY: OleCreate writes an IOleObject into `out` on success.
        unsafe { OleCreate(&CLSID, &IOleObject::IID, OLERENDER_DRAW, std::ptr::null(), site, stg, &mut out as *mut _ as *mut _) }.map(|_| out.unwrap())
    };
    match try_once() {
        Ok(o) => (o, false),
        Err(e) if e.code() == REGDB_E_CLASSNOTREG => {
            register_machine();
            (try_once().expect("OleCreate with HKLM keys"), true)
        }
        Err(e) => panic!("OleCreate failed: {e}"),
    }
}

// R12, and the spike for risk 3: Octet's own keys, read back; whether this (possibly elevated) process sees them.
#[test]
#[ignore = "writes the registry and starts Octet: Windows CI"]
fn registration() {
    register();
    let base = format!("HKCU\\Software\\Classes\\CLSID\\{CLSID_TEXT}");
    let server = query(&format!("{base}\\LocalServer32")).expect("LocalServer32");
    assert_eq!(server.trim_matches('"').to_ascii_lowercase(), octet().canonicalize().unwrap().to_string_lossy().trim_start_matches(r"\\?\").to_ascii_lowercase());
    assert_eq!(query(&format!("{base}\\InprocHandler32")).as_deref(), Some("ole32.dll"));
    assert_eq!(query(&format!("{base}\\ProgID")).as_deref(), Some("OctetDraw.Drawing.1"));
    assert_eq!(query(&format!("{base}\\Verb\\0")).as_deref(), Some("&Edit,0,2"));
    assert_eq!(query("HKCU\\Software\\Classes\\OctetDraw.Drawing\\CurVer").as_deref(), Some("OctetDraw.Drawing.1"));
    // The 32-bit view has the class too, for 32-bit Office.
    assert_eq!(query_view(&format!("{base}\\LocalServer32"), "/reg:32"), Some(server.clone()), "32-bit view");
    assert_eq!(query_view(&format!("{base}\\Verb\\0"), "/reg:32").as_deref(), Some("&Edit,0,2"), "32-bit view");
    // Does COM in this process see the per-user class? Elevated, it does not (risk 3): say so, do not fail.
    let seen = with_ole(|| {
        let mut out: Option<IOleObject> = None;
        let stg = storage();
        // SAFETY: as in create().
        let r = unsafe { OleCreate(&CLSID, &IOleObject::IID, OLERENDER_DRAW, std::ptr::null(), None::<&IOleClientSite>, &stg, &mut out as *mut _ as *mut _) };
        if let Some(o) = out {
            // SAFETY: a live object.
            let _ = unsafe { o.Close(OLECLOSE_NOSAVE) };
        }
        r
    });
    println!("per-user registration seen by this process: {}", match &seen { Ok(()) => "yes".to_string(), Err(e) => format!("no ({e})") });
    let status = Command::new(octet()).arg("--unregister-ole").status().unwrap();
    assert!(status.success());
    assert!(query(&base).is_none(), "the class key is gone after --unregister-ole");
    assert!(query_view(&base, "/reg:32").is_none(), "and from the 32-bit view");
    assert!(query("HKCU\\Software\\Classes\\OctetDraw.Drawing").is_none());
}

// Insert > Object > Create New, as Word does it: OleCreate starts Octet with -Embedding (InitNew), OleRun, then Show:
// Octet calls ShowObject and OnShowWindow(TRUE). Close: OnShowWindow(FALSE) and OnClose, and Octet ends within 10 s.
// Saving the new object writes the Octet stream (empty: nothing drawn), and its class.
#[test]
#[ignore = "writes the registry and starts Octet: Windows CI"]
fn create_new_show_and_close() {
    register();
    let before = octets_running();
    let machine = with_ole(|| {
        let stg = storage();
        let (site, log, site_obj) = site(stg.clone());
        let (obj, machine) = create(&site, &stg);
        *site_obj.object.borrow_mut() = Some(obj.cast().unwrap());
        // SAFETY: COM calls on live objects. The sink is the site's IAdviseSink.
        unsafe {
            let sink: IAdviseSink = site_obj.to_interface();
            obj.Advise(&sink).unwrap();
            OleRun(&obj).unwrap();
            OleSetContainedObject(&obj, true).unwrap();
            obj.SetHostNames(windows_core::w!("Harness"), windows_core::w!("Document1")).unwrap();
            obj.DoVerb(OLEIVERB_SHOW.0, std::ptr::null(), &site, 0, windows::Win32::Foundation::HWND::default(), std::ptr::null()).unwrap();
            // The window opens from Octet's async runtime; its page listens for Close once it has loaded.
            pump_for(Duration::from_secs(10));
            assert_eq!(obj.GetUserClassID().unwrap(), CLSID);
            let p: IPersistStorage = obj.cast().unwrap();
            OleSave(&p, &stg, true).unwrap();
            p.SaveCompleted(None).unwrap();
            assert_eq!(ReadClassStg(&stg).unwrap(), CLSID);
            assert_eq!(read_octet_stream(&stg), Some(Vec::new()), "a new object holds an empty drawing");
            obj.Close(OLECLOSE_NOSAVE).unwrap();
        }
        let log = log.borrow().clone();
        let at = |s: &str| log.iter().position(|l| l == s);
        assert!(at("ShowObject").is_some() && at("OnShowWindow(true)").is_some(), "{log:?}");
        assert!(at("ShowObject") < at("OnShowWindow(true)"), "ShowObject first: {log:?}");
        assert!(at("OnShowWindow(false)").is_some() && at("OnClose").is_some(), "{log:?}");
        assert!(at("OnShowWindow(false)") < at("OnClose"), "{log:?}");
        machine
    });
    assert!(wait(10, || octets_running() <= before), "the Octet that COM started ends once Word lets go");
    if machine {
        unregister_machine();
    }
    let _ = Command::new(octet()).arg("--unregister-ole").status();
}

// Word's first call can come after Home's hidden page has loaded (issue 24: Octet ended then, and Word's insert never
// finished). The harness starts Octet as Windows does, gives the page time to load, and only then asks for an object.
// The same Octet serves it, and ends once Word lets go. An Octet that no object comes to ends after a minute.
#[test]
#[ignore = "writes the registry and starts Octet: Windows CI"]
fn started_for_word_waits_for_the_first_object() {
    register();
    let before = octets_running();
    let mut octet_for_word = Command::new(octet()).arg("-Embedding").spawn().expect("octet runs");
    std::thread::sleep(Duration::from_secs(15));
    assert!(octet_for_word.try_wait().unwrap().is_none(), "Octet ended before Word's first call");
    let machine = with_ole(|| {
        let stg = storage();
        let (site, _log, _site_obj) = site(stg.clone());
        let (obj, machine) = create(&site, &stg);
        // SAFETY: COM calls on a live object.
        unsafe {
            OleRun(&obj).unwrap();
            assert_eq!(octets_running(), before + 1, "the Octet that waited serves the object");
            obj.Close(OLECLOSE_NOSAVE).unwrap();
        }
        machine
    });
    assert!(wait(10, || octet_for_word.try_wait().unwrap().is_some()), "Octet ends once Word lets go of its object");
    let mut unused = Command::new(octet()).arg("-Embedding").spawn().expect("octet runs");
    assert!(wait(80, || unused.try_wait().unwrap().is_some()), "an Octet that no object came to ends after a minute");
    if machine {
        unregister_machine();
    }
    let _ = Command::new(octet()).arg("--unregister-ole").status();
}

// An object from a document: OleLoad gives the handler the storage; OleRun starts Octet, which reads its stream. Then
// hostile storages (R13): each is refused by Load, so OleRun fails, and Octet does not crash (the next object still
// runs).
#[test]
#[ignore = "writes the registry and starts Octet: Windows CI"]
fn load_and_hostile_storages() {
    register();
    let mut machine = false;
    with_ole(|| {
        let load = |stg: &IStorage| -> Result<IOleObject> {
            let (site, _log, _obj) = site(stg.clone());
            let mut out: Option<IOleObject> = None;
            // SAFETY: OleLoad writes an IOleObject into `out` on success; OleRun starts the server.
            unsafe {
                OleLoad(stg, &IOleObject::IID, &site, &mut out as *mut _ as *mut _)?;
                let o = out.unwrap();
                OleRun(&o)?;
                Ok(o)
            }
        };
        let good = object_storage(b"<?xml version=\"1.0\"?><CDXML><page/></CDXML>");
        let first = load(&good);
        let first = match first {
            Err(e) if e.code() == REGDB_E_CLASSNOTREG => {
                register_machine();
                machine = true;
                load(&good)
            }
            r => r,
        };
        let o = first.expect("a sound object runs");
        // SAFETY: a live object.
        unsafe { o.Close(OLECLOSE_NOSAVE).unwrap() };
        let big = vec![b'a'; 65 << 20];
        for (what, stg) in [("65 MB", object_storage(&big)), ("not UTF-8", object_storage(&[0xff, 0xfe, 0x80])), ("no stream", {
            let s = storage();
            // SAFETY: a live storage.
            unsafe { WriteClassStg(&s, &CLSID).unwrap() };
            s
        })] {
            assert!(load(&stg).is_err(), "{what} is refused");
        }
        let o = load(&good).expect("Octet still serves after the refusals");
        // SAFETY: a live object.
        unsafe { o.Close(OLECLOSE_NOSAVE).unwrap() };
    });
    if machine {
        unregister_machine();
    }
    let _ = Command::new(octet()).arg("--unregister-ole").status();
}

// Word closes a document with the object's window open (R14): Close answers at once for SAVEIFDIRTY and PROMPTSAVE,
// shows no question, and saves nothing when nothing changed. Then the window closes and Octet ends.
#[test]
#[ignore = "writes the registry and starts Octet: Windows CI"]
fn close_answers_at_once() {
    register();
    let before = octets_running();
    let mut machine = false;
    for option in [OLECLOSE_SAVEIFDIRTY, OLECLOSE_PROMPTSAVE] {
        machine |= with_ole(|| close_once(option));
    }
    assert!(wait(10, || octets_running() <= before), "Octet ends once Word lets go");
    if machine {
        unregister_machine();
    }
    let _ = Command::new(octet()).arg("--unregister-ole").status();
}

fn close_once(option: OLECLOSE) -> bool {
    let stg = storage();
    let (site, log, site_obj) = site(stg.clone());
    let (obj, machine) = create(&site, &stg);
    *site_obj.object.borrow_mut() = Some(obj.cast().unwrap());
    // SAFETY: COM calls on live objects. The sink is the site's IAdviseSink.
    unsafe {
        let sink: IAdviseSink = site_obj.to_interface();
        obj.Advise(&sink).unwrap();
        OleRun(&obj).unwrap();
        obj.SetHostNames(windows_core::w!("Harness"), windows_core::w!("Document1")).unwrap();
        obj.DoVerb(OLEIVERB_SHOW.0, std::ptr::null(), &site, 0, windows::Win32::Foundation::HWND::default(), std::ptr::null()).unwrap();
        pump_for(Duration::from_secs(10));
        // Word saves a new object once (InitNew leaves it changed); after that nothing has changed.
        let p: IPersistStorage = obj.cast().unwrap();
        OleSave(&p, &stg, true).unwrap();
        p.SaveCompleted(None).unwrap();
        let t = Instant::now();
        obj.Close(option).unwrap();
        assert!(t.elapsed() < Duration::from_secs(2), "Close({}) took {:?}", option.0, t.elapsed());
    }
    let log = log.borrow().clone();
    assert!(log.iter().any(|l| l == "OnClose"), "{log:?}");
    assert!(!log.iter().any(|l| l == "SaveObject"), "nothing changed, nothing saved: {log:?}");
    machine
}
