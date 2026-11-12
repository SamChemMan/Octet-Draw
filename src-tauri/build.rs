fn main() {
    // Feedback (src/feedback.rs) is for testers (REL-8), so every build has it while friends test Octet.
    // OCTET_FEEDBACK=0 leaves it out: the release workflow sets it for the public release. vite.config.ts reads the
    // same variable.
    println!("cargo::rustc-check-cfg=cfg(feedback)");
    println!("cargo::rerun-if-env-changed=OCTET_FEEDBACK");
    if std::env::var("OCTET_FEEDBACK").as_deref() != Ok("0") {
        println!("cargo::rustc-cfg=feedback");
    }
    oxt();
    tauri_build::build()
}

// LibreOffice's Octet extension (tools/libreoffice) as one .oxt file: a zip of these files, stored, with Octet's
// version in its description.xml. Linux builds bundle it (tauri.linux.conf.json) for Settings > General > Add to
// LibreOffice. The file changes only when what goes in it changes.
const OXT: [&str; 5] = ["META-INF/manifest.xml", "description.xml", "octet_draw.py", "Jobs.xcu", "Addons.xcu"];

fn oxt() {
    // A copy of Octet with no extension (a branch from before it, sharing this build folder) makes none.
    if !std::path::Path::new("../tools/libreoffice").is_dir() {
        return;
    }
    println!("cargo::rerun-if-changed=../tools/libreoffice");
    println!("cargo::rerun-if-changed=../package.json");
    let package = std::fs::read_to_string("../package.json").expect("package.json");
    let version = package.split("\"version\": \"").nth(1).and_then(|v| v.split('"').next()).expect("package.json has a version");
    let (mut zip, mut directory) = (Vec::new(), Vec::new());
    for name in OXT {
        let mut data = std::fs::read(format!("../tools/libreoffice/{name}")).expect(name);
        if name == "description.xml" {
            data = String::from_utf8(data).unwrap().replace("<version value=\"0.0.0\"/>", &format!("<version value=\"{version}\"/>")).into_bytes();
        }
        // Version 2.0, no flags, stored, 1 January 1980, the CRC-32 and both sizes, the name's length, no extra field.
        let fields = [&[20, 0, 0, 0, 0, 0, 0, 0, 0x21, 0][..], &crc32(&data).to_le_bytes(), &(data.len() as u32).to_le_bytes(), &(data.len() as u32).to_le_bytes(), &(name.len() as u16).to_le_bytes(), &[0, 0]].concat();
        directory.extend([&b"PK\x01\x02\x14\x00"[..], &fields, &[0; 10], &(zip.len() as u32).to_le_bytes(), name.as_bytes()].concat());
        zip.extend([&b"PK\x03\x04"[..], &fields, name.as_bytes(), &data].concat());
    }
    let n = (OXT.len() as u16).to_le_bytes();
    let end = [&b"PK\x05\x06"[..], &[0; 4], &n, &n, &(directory.len() as u32).to_le_bytes(), &(zip.len() as u32).to_le_bytes(), &[0, 0]].concat();
    let oxt = [zip, directory, end].concat();
    std::fs::create_dir_all("gen").unwrap();
    if std::fs::read("gen/octet-draw.oxt").ok().as_ref() != Some(&oxt) {
        std::fs::write("gen/octet-draw.oxt", oxt).unwrap();
    }
}

fn crc32(data: &[u8]) -> u32 {
    let mut c = !0u32;
    for &b in data {
        c ^= u32::from(b);
        for _ in 0..8 {
            c = (c >> 1) ^ (0xEDB8_8320 & (c & 1).wrapping_neg());
        }
    }
    !c
}
