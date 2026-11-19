// Settings > General > Add to LibreOffice, on every system: Octet's extension for LibreOffice (tools/libreoffice,
// decision 0025) in LibreOffice's Extension Manager, which asks the user to confirm. `unopkg gui <oxt>` shows the
// manager on its own when LibreOffice is closed, so no restart is needed, and in LibreOffice when it is open. The
// .oxt opened as a file starts a closed LibreOffice with the file as its argument, and the restart after the install
// opens it again: a second install prompt. So Octet opens the file (with the system, which gives it to LibreOffice)
// only when it finds no unopkg, or unopkg does not start. The page shows a failure as "Octet cannot open LibreOffice."
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn add_to_libreoffice(app: AppHandle) -> Result<(), String> {
    let oxt = app.path().resolve("libreoffice/octet-draw.oxt", tauri::path::BaseDirectory::Resource).map_err(|e| e.to_string())?;
    // Linux, as in 1.1.2: unopkg on the PATH. A Flatpak Octet has no unopkg and opens the file through the system's
    // portal. Octet writes its path again for the extension (linux::note_path).
    #[cfg(target_os = "linux")]
    {
        crate::linux::note_path(&app);
        crate::linux::spawn(std::process::Command::new("unopkg").arg("gui").arg(&oxt)).or_else(|_| crate::open_external(&oxt)).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        if found().is_some_and(|unopkg| start(&unopkg, &oxt).is_ok()) {
            return Ok(());
        }
        crate::open_external(&oxt).map_err(|e| e.to_string())
    }
}

// unopkg, with fixed arguments and no shell. On Windows with no console window.
#[cfg(not(target_os = "linux"))]
fn start(unopkg: &Path, oxt: &Path) -> std::io::Result<()> {
    use std::process::Stdio;
    let mut c = std::process::Command::new(unopkg);
    c.arg("gui").arg(oxt).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = c.spawn()?;
    std::thread::spawn(move || child.wait());
    Ok(())
}

// The first of the places that is a file.
#[cfg_attr(target_os = "linux", allow(dead_code))]
fn first(places: Vec<PathBuf>, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    places.into_iter().find(|p| exists(p))
}

// A path from the registry: quotes off, and absolute only.
#[cfg_attr(target_os = "linux", allow(dead_code))]
fn absolute(value: &str) -> Option<PathBuf> {
    let v = value.trim();
    let v = v.strip_prefix('"').and_then(|v| v.strip_suffix('"')).unwrap_or(v);
    let p = PathBuf::from(v);
    (!v.is_empty() && p.is_absolute()).then_some(p)
}

// The Mac: the LibreOffice that LaunchServices knows by its id (wherever the user put it), then /Applications, then
// ~/Applications. unopkg is in Contents/MacOS.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn mac_places(registered: Option<PathBuf>, home: Option<PathBuf>) -> Vec<PathBuf> {
    let apps = registered.into_iter().chain([PathBuf::from("/Applications/LibreOffice.app")]).chain(home.map(|h| h.join("Applications").join("LibreOffice.app")));
    apps.map(|a| a.join("Contents").join("MacOS").join("unopkg")).collect()
}

// Windows: the program folder LibreOffice's installer names in Software\LibreOffice\UNO\InstallPath (the user's own
// install, then the computer's; each in the 64-bit view, then the 32-bit), then unopkg.exe's App Paths entry, then the
// usual folders. `env` reads a variable.
#[cfg_attr(not(windows), allow(dead_code))]
fn windows_places(install_paths: &[String], app_paths: &[String], env: impl Fn(&str) -> Option<String>) -> Vec<PathBuf> {
    let program = |dir: PathBuf| dir.join("unopkg.exe");
    let mut out: Vec<PathBuf> = install_paths.iter().filter_map(|v| absolute(v)).map(program).collect();
    out.extend(app_paths.iter().filter_map(|v| absolute(v)).filter(|p| p.file_name().is_some_and(|n| n.eq_ignore_ascii_case("unopkg.exe"))));
    for (var, sub) in [("ProgramFiles", &["LibreOffice", "program"][..]), ("ProgramFiles(x86)", &["LibreOffice", "program"]), ("LOCALAPPDATA", &["Programs", "LibreOffice", "program"])] {
        if let Some(base) = env(var).as_deref().and_then(absolute) {
            out.push(program(sub.iter().fold(base, |p, s| p.join(s))));
        }
    }
    out
}

#[cfg(target_os = "macos")]
fn found() -> Option<PathBuf> {
    let registered = objc2::rc::autoreleasepool(|_| {
        let url = objc2_app_kit::NSWorkspace::sharedWorkspace().URLForApplicationWithBundleIdentifier(&objc2_foundation::NSString::from_str("org.libreoffice.script"))?;
        Some(PathBuf::from(url.path()?.to_string()))
    });
    first(mac_places(registered, std::env::var_os("HOME").map(PathBuf::from)), |p| p.is_file())
}

#[cfg(windows)]
fn found() -> Option<PathBuf> {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    let both = |key: &str| [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE].into_iter().flat_map(|root| [true, false].map(|wide| reg_get(root, wide, key))).flatten().collect::<Vec<_>>();
    let places = windows_places(&both("Software\\LibreOffice\\UNO\\InstallPath"), &both("Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\unopkg.exe"), |v| std::env::var(v).ok());
    first(places, |p| p.is_file())
}

// A key's default value (REG_SZ), in the 64-bit view (wide) or the 32-bit one.
#[cfg(windows)]
fn reg_get(root: windows::Win32::System::Registry::HKEY, wide: bool, key: &str) -> Option<String> {
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegGetValueW, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6432KEY, RRF_SUBKEY_WOW6464KEY};
    use windows::core::PCWSTR;
    let path: Vec<u16> = key.encode_utf16().chain([0]).collect();
    let mut buf = vec![0u16; 1024];
    let mut size = (buf.len() * 2) as u32;
    let flags = RRF_RT_REG_SZ | if wide { RRF_SUBKEY_WOW6464KEY } else { RRF_SUBKEY_WOW6432KEY };
    // SAFETY: `path` lives for the call; `buf` holds `size` bytes, and RegGetValueW writes at most that.
    let got = unsafe { RegGetValueW(root, PCWSTR(path.as_ptr()), PCWSTR::null(), flags, None, Some(buf.as_mut_ptr().cast()), Some(&mut size)) };
    if got != ERROR_SUCCESS {
        return None;
    }
    let n = (size as usize / 2).min(buf.len());
    Some(String::from_utf16_lossy(&buf[..n]).trim_end_matches('\0').to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // A folder of stand-ins for LibreOffice's installs, removed when the test ends.
    struct Folder(PathBuf);
    impl Folder {
        fn new(name: &str) -> Folder {
            let dir = std::env::temp_dir().join(format!("octet-lo-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Folder(dir)
        }
        fn file(&self, rel: &[&str]) -> PathBuf {
            let p = rel.iter().fold(self.0.clone(), |p, s| p.join(s));
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, "").unwrap();
            p
        }
    }
    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn is_file(p: &Path) -> bool {
        p.is_file()
    }

    // The Mac: LaunchServices' LibreOffice first (one the user moved), then /Applications, then ~/Applications. A
    // folder named unopkg is no program.
    #[test]
    fn unopkg_on_the_mac() {
        let f = Folder::new("mac");
        // Only the stand-ins count: a LibreOffice installed on the computer that runs the test is not one.
        let is_file = |p: &Path| p.starts_with(&f.0) && p.is_file();
        let home = f.0.join("home");
        let moved = f.0.join("Tools").join("LibreOffice.app");
        assert_eq!(first(mac_places(Some(moved.clone()), Some(home.clone())), is_file), None, "no LibreOffice");
        let in_home = f.file(&["home", "Applications", "LibreOffice.app", "Contents", "MacOS", "unopkg"]);
        assert_eq!(first(mac_places(None, Some(home.clone())), is_file), Some(in_home.clone()));
        let found = f.file(&["Tools", "LibreOffice.app", "Contents", "MacOS", "unopkg"]);
        assert_eq!(first(mac_places(Some(moved), Some(home.clone())), is_file), Some(found));
        let places = mac_places(None, Some(home));
        assert_eq!(places[0], Path::new("/Applications/LibreOffice.app/Contents/MacOS/unopkg"));
        assert_eq!(places[1], in_home);
        std::fs::create_dir_all(f.0.join("Dir.app").join("Contents").join("MacOS").join("unopkg")).unwrap();
        assert_eq!(first(mac_places(Some(f.0.join("Dir.app")), None), is_file), None, "a folder");
    }

    // Windows: InstallPath (the user's, then the computer's), App Paths, then Program Files, Program Files (x86) and
    // the user's Programs folder. Values in quotes are read; relative or empty ones, and an App Paths entry for another
    // program, are not.
    #[test]
    fn unopkg_on_windows() {
        let f = Folder::new("win");
        let root = &f.0;
        let s = |p: &Path| p.to_string_lossy().into_owned();
        let user = f.0.join("user").join("program");
        let machine = f.0.join("machine").join("program");
        let env = |pf: Option<PathBuf>| move |v: &str| match v {
            "ProgramFiles" => pf.as_ref().map(|p| s(p)),
            "ProgramFiles(x86)" => Some(s(&root.join("x86"))),
            "LOCALAPPDATA" => Some(s(&root.join("local"))),
            _ => None,
        };
        let installs = [String::new(), "program".to_string(), format!("\"{}\"", s(&user)), s(&machine)];
        let pf = f.0.join("pf");
        let places = windows_places(&installs, &[s(&f.0.join("app").join("soffice.exe")), s(&f.0.join("app").join("UNOPKG.EXE"))], env(Some(pf.clone())));
        assert_eq!(places, [user.join("unopkg.exe"), machine.join("unopkg.exe"), f.0.join("app").join("UNOPKG.EXE"), pf.join("LibreOffice").join("program").join("unopkg.exe"), f.0.join("x86").join("LibreOffice").join("program").join("unopkg.exe"), f.0.join("local").join("Programs").join("LibreOffice").join("program").join("unopkg.exe")]);
        assert_eq!(first(places.clone(), is_file), None);
        let local = f.file(&["local", "Programs", "LibreOffice", "program", "unopkg.exe"]);
        assert_eq!(first(places.clone(), is_file), Some(local));
        let x86 = f.file(&["x86", "LibreOffice", "program", "unopkg.exe"]);
        assert_eq!(first(places.clone(), is_file), Some(x86));
        let machine_exe = f.file(&["machine", "program", "unopkg.exe"]);
        assert_eq!(first(places.clone(), is_file), Some(machine_exe));
        let user_exe = f.file(&["user", "program", "unopkg.exe"]);
        assert_eq!(first(places, is_file), Some(user_exe));
        assert!(windows_places(&[], &[], env(None)).iter().all(|p| !p.starts_with(&pf)), "no ProgramFiles");
        assert_eq!(absolute(" \"\" "), None);
        assert_eq!(absolute("\"relative\\path\""), None);
    }
}
