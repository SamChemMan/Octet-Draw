// Copy and paste with Word, PowerPoint, Keynote and ChemDraw, as ChemDraw's own clipboard works (macOS).
// Copy puts one pasteboard item holding, in this order: a vector PDF of the selection with its CDXML in the
// catalog /Metadata (Office keeps it; ChemDraw and Octet read the structure back out of it), ChemDraw's CDX type
// under its PerkinElmer and Revvity names (ChemDraw reads it first, so the whole drawing pastes into ChemDraw), the
// CDXML type, a molfile as length-prefixed lines, SMILES with a NUL, and Octet's own JSON for a lossless paste into
// Octet. Settings > Import and export > Copy switches the PDF, CDX, CDXML, MOL and SMILES types off (REL-19, CH-8);
// Octet's JSON always goes on.
// No plain text: ChemDraw reads text before pictures and would paste it as a caption.
// Windows and Linux: the page copies and pastes through the webview's own clipboard (Octet's JSON and SMILES as
// text), and these commands are not used there.
//
// WebKit keeps the page's own clipboard types in a blob of its own and shows a page only text, HTML and URLs
// from other apps, so the page cannot read these types itself: paste calls read_clipboard.

pub const PDF: &str = "com.adobe.pdf";
// ChemDraw 26.1 declares the Revvity name too.
pub const CDX: [&str; 3] = ["com.perkinelmer.chemdraw.cdx-clipboard", "com.revvity.chemdraw.cdx-clipboard", "com.cambridgesoft.cdx"];
pub const CDXML: &str = "com.perkinelmer.cdxml";
pub const MOLFILE: &str = "com.mdli.molfile";
pub const SMILES: &str = "org.opensmiles.smiles";
// Octet's own type. A UTI under the app's identifier: macOS refuses MIME-style names such as
// application/x-octet+json on the pasteboard.
pub const OCTET: &str = "io.github.samchemman.octet.json";

const MAX_TYPE: usize = 64 << 20;

// What paste found on the clipboard. Each is None when absent or unreadable.
#[derive(serde::Serialize, Default, Debug, PartialEq)]
pub struct Clip {
    octet: Option<String>,   // Octet's own JSON
    cdxml: Option<String>,   // CDXML: ChemDraw's CDXML type, or hidden in a PDF (Octet's, ChemDraw's, or either after Word)
    cdx: Option<String>,     // ChemDraw's CDX, base64
    molfile: Option<String>, // a molfile or RXN file, with LF line ends
    smiles: Option<String>,
}

// ChemDraw's form of a molfile on the clipboard: each line as one length byte, then the line, with no line ends.
// None if a line is longer than 255 bytes (V2000 lines never are).
pub fn prefixed_lines(text: &str) -> Option<Vec<u8>> {
    let text = text.replace("\r\n", "\n").replace('\r', "\n");
    let text = text.strip_suffix('\n').unwrap_or(&text);
    let mut out = Vec::with_capacity(text.len() + 1);
    for line in text.split('\n') {
        out.push(u8::try_from(line.len()).ok()?);
        out.extend_from_slice(line.as_bytes());
    }
    Some(out)
}

// A molfile from the clipboard: ChemDraw's length-prefixed lines, or ordinary text with CR, LF or CRLF.
pub fn molfile_text(b: &[u8]) -> Option<String> {
    let b = &b[..b.iter().rposition(|&c| c != 0).map_or(0, |k| k + 1)];
    if b.is_empty() {
        return None;
    }
    let mut lines = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let n = usize::from(b[i]);
        match b.get(i + 1..i + 1 + n) {
            Some(line) if !line.contains(&b'\r') && !line.contains(&b'\n') => lines.push(line),
            _ => {
                lines.clear();
                break;
            }
        }
        i += 1 + n;
    }
    let text = if lines.is_empty() {
        String::from_utf8_lossy(b).replace("\r\n", "\n").replace('\r', "\n")
    } else {
        String::from_utf8_lossy(&lines.join(&b'\n')).into_owned()
    };
    Some(if text.ends_with('\n') { text } else { text + "\n" })
}

// SMILES from the clipboard: ASCII, with or without ChemDraw's trailing NUL.
pub fn smiles_text(b: &[u8]) -> Option<String> {
    let s = std::str::from_utf8(b).ok()?.trim_matches(|c: char| c == '\0' || c.is_whitespace());
    (!s.is_empty() && s.is_ascii() && !s.contains('\0')).then(|| s.to_string())
}

// The types for one copy, in ChemDraw's order. svg: the picture, for the PDF (None: no PDF). cdxml: hidden in the
// PDF, and also put on as its own type when `cdxml_type` is set. cdx: ChemDraw's binary drawing.
fn types(svg: Option<&str>, cdxml: Option<&str>, cdxml_type: bool, cdx: Option<Vec<u8>>, molfile: Option<&str>, smiles: Option<&str>, octet_json: Option<String>) -> Result<Vec<(&'static str, Vec<u8>)>, String> {
    let mut out = Vec::new();
    if let Some(svg) = svg {
        out.push((PDF, crate::export::make_pdf(svg, cdxml)?));
    }
    if let Some(b) = cdx.filter(|b| b.starts_with(b"VjCD0100")) {
        out.push((CDX[0], b.clone()));
        out.push((CDX[1], b));
    }
    if let Some(x) = cdxml.filter(|_| cdxml_type) {
        out.push((CDXML, crate::export::cdxml_document(x).into_bytes()));
    }
    if let Some(m) = molfile.filter(|m| !m.trim().is_empty()).and_then(prefixed_lines) {
        out.push((MOLFILE, m));
    }
    if let Some(s) = smiles.map(str::trim).filter(|s| !s.is_empty() && s.is_ascii()) {
        out.push((SMILES, [s.as_bytes(), b"\0"].concat()));
    }
    if let Some(j) = octet_json {
        out.push((OCTET, j.into_bytes()));
    }
    Ok(out)
}

// What paste can use, from each type's bytes (`read` gives a type's bytes if it is on the clipboard).
fn clip(read: impl Fn(&str) -> Option<Vec<u8>>) -> Clip {
    use base64::Engine;
    let text = |t: &str| read(t).and_then(|b| String::from_utf8(b).ok());
    let mut c = Clip {
        octet: text(OCTET),
        cdxml: text(CDXML),
        cdx: CDX.iter().find_map(|t| read(t)).map(|b| base64::engine::general_purpose::STANDARD.encode(b)),
        molfile: read(MOLFILE).and_then(|b| molfile_text(&b)),
        smiles: read(SMILES).and_then(|b| smiles_text(&b)),
    };
    // The PDF's CDXML when there is no Octet JSON or CDXML type: it holds the whole drawing, arrows, text and shapes
    // too (REL-4, CH-2). ChemDraw's CDX is the page's next choice, for a copy with no PDF.
    if c.octet.is_none() && c.cdxml.is_none() {
        c.cdxml = read(PDF).and_then(|b| crate::export::cdxml_from_pdf(&b));
    }
    c
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::runtime::ProtocolObject;
    use objc2_app_kit::{NSPasteboard, NSPasteboardItem};
    use objc2_foundation::{NSArray, NSData, NSString};

    pub fn write(pb: &NSPasteboard, types: &[(&str, Vec<u8>)]) -> Result<(), String> {
        autoreleasepool(|_| {
            let item = NSPasteboardItem::new();
            for (t, bytes) in types {
                if !item.setData_forType(&NSData::with_bytes(bytes), &NSString::from_str(t)) {
                    return Err("Octet could not copy this.".to_string());
                }
            }
            pb.clearContents();
            let items: Retained<NSArray<ProtocolObject<dyn objc2_app_kit::NSPasteboardWriting>>> = NSArray::from_retained_slice(&[ProtocolObject::from_retained(item)]);
            if pb.writeObjects(&items) { Ok(()) } else { Err("Octet could not copy this.".to_string()) }
        })
    }

    // The bytes of each type on the clipboard (64 MB at most), read only if the clipboard has that type.
    pub fn read(pb: &NSPasteboard) -> super::Clip {
        autoreleasepool(|_| {
            let present: Vec<String> = pb.types().map(|a| a.iter().map(|t| t.to_string()).collect()).unwrap_or_default();
            super::clip(|t| {
                if !present.iter().any(|p| p == t) {
                    return None;
                }
                let data = pb.dataForType(&NSString::from_str(t))?;
                (data.len() <= super::MAX_TYPE).then(|| data.to_vec())
            })
        })
    }

    pub fn general() -> Retained<NSPasteboard> {
        NSPasteboard::generalPasteboard()
    }
}

// Copy: the selection as a PDF picture (with its CDXML hidden in it), CDX (base64 from the page), CDXML, a molfile,
// SMILES and Octet's JSON.
#[tauri::command]
pub async fn copy_to_clipboard(svg: Option<String>, cdxml: Option<String>, cdxml_type: Option<bool>, cdx: Option<String>, molfile: Option<String>, smiles: Option<String>, octet_json: Option<String>) -> Result<(), String> {
    use base64::Engine;
    let cdx = match cdx {
        Some(c) if c.len() <= MAX_TYPE / 3 * 4 + 4 => Some(base64::engine::general_purpose::STANDARD.decode(c).map_err(|_| "Octet could not copy this.".to_string())?),
        _ => None,
    };
    let types = types(svg.as_deref(), cdxml.as_deref(), cdxml_type.unwrap_or(false), cdx, molfile.as_deref(), smiles.as_deref(), octet_json)?;
    #[cfg(target_os = "macos")]
    return mac::write(&mac::general(), &types);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = types;
        Err("Copying pictures is not yet available on this system.".into())
    }
}

// Paste: everything Octet can use from the clipboard.
#[tauri::command]
pub async fn read_clipboard() -> Result<Clip, String> {
    #[cfg(target_os = "macos")]
    return Ok(mac::read(&mac::general()));
    #[cfg(not(target_os = "macos"))]
    Err("Pasting structures from other apps is not yet available on this system.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MOL: &str = "\n  Octet\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\n    1.0000    0.0000    0.0000 O   0  0\n  1  2  1  0\nM  END\n";

    #[test]
    fn molfile_as_chemdraw_writes_it() {
        let b = prefixed_lines(MOL).unwrap();
        // One length byte per line instead of each line end, so the same length as the text.
        assert_eq!(b.len(), MOL.len());
        assert_eq!(b[0], 0);
        assert_eq!(&b[1..9], b"\x07  Octet");
        assert!(b.ends_with(b"\x06M  END"));
        assert_eq!(molfile_text(&b).as_deref(), Some(MOL));
        // Ordinary text with CR line ends reads too.
        assert_eq!(molfile_text(MOL.replace('\n', "\r").as_bytes()).as_deref(), Some(MOL));
        assert_eq!(prefixed_lines(&"x".repeat(300)), None);
    }

    #[test]
    fn smiles_with_nul() {
        assert_eq!(smiles_text(b"N[C@@H](CC1=CC=CC=C1)C(O)=O\0").as_deref(), Some("N[C@@H](CC1=CC=CC=C1)C(O)=O"));
        assert_eq!(smiles_text(b"CCO").as_deref(), Some("CCO"));
        assert_eq!(smiles_text(b"\0"), None);
    }

    #[test]
    fn copy_types_in_chemdraws_order() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="20pt" height="10pt" viewBox="0 0 20 10"><path d="M1 1H19V2H1Z"/></svg>"#;
        let t = types(Some(svg), Some("<CDXML/>"), true, Some(b"VjCD0100\x04\x03\x02\x01".to_vec()), Some(MOL), Some("CO"), Some("{}".into())).unwrap();
        assert_eq!(t.iter().map(|(t, _)| *t).collect::<Vec<_>>(), [PDF, CDX[0], CDX[1], CDXML, MOLFILE, SMILES, OCTET]);
        assert!(t[1].1.starts_with(b"VjCD0100") && t[1].1 == t[2].1);
        let t = types(Some(svg), Some("<CDXML/>"), true, None, Some(MOL), Some("CO"), Some("{}".into())).unwrap();
        assert_eq!(t.iter().map(|(t, _)| *t).collect::<Vec<_>>(), [PDF, CDXML, MOLFILE, SMILES, OCTET]);
        assert!(t[1].1.starts_with(b"<?xml") && t[1].1.ends_with(b"<CDXML/>"));
        assert_eq!(t[3].1, b"CO\0");
        // Paste reads them all back; the PDF is not needed when Octet's JSON is there.
        let read = |name: &str| t.iter().find(|(n, _)| *n == name).map(|(_, b)| b.clone());
        let c = clip(read);
        assert_eq!((c.octet.as_deref(), c.molfile.as_deref(), c.smiles.as_deref()), (Some("{}"), Some(MOL), Some("CO")));
        // Without it (a picture copied back out of Word), the CDXML comes out of the PDF.
        let c = clip(|name| (name == PDF).then(|| t[0].1.clone()));
        assert!(c.cdxml.unwrap().contains("<CDXML/>"));
        // The Copy switches in Settings: with all four off, only Octet's JSON goes on; CDXML off keeps it in the PDF.
        let t = types(None, Some("<CDXML/>"), false, None, None, None, Some("{}".into())).unwrap();
        assert_eq!(t.iter().map(|(t, _)| *t).collect::<Vec<_>>(), [OCTET]);
        let t = types(Some(svg), Some("<CDXML/>"), false, None, None, Some("CO"), None).unwrap();
        assert_eq!(t.iter().map(|(t, _)| *t).collect::<Vec<_>>(), [PDF, SMILES]);
        assert!(crate::export::cdxml_from_pdf(&t[0].1).unwrap().contains("<CDXML/>"));
    }

    // REL-4, CH-2: ChemDraw's copy has a CDX as well as its PDF. Paste still takes the whole drawing from the PDF.
    #[test]
    fn chemdraws_copy_pastes_from_its_pdf() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="20pt" height="10pt" viewBox="0 0 20 10"><path d="M1 1H19V2H1Z"/></svg>"#;
        let pdf = crate::export::make_pdf(svg, Some("<CDXML><page><arrow/></page></CDXML>")).unwrap();
        for cdx in CDX {
            let c = clip(|name| match name {
                PDF => Some(pdf.clone()),
                n if n == cdx => Some(b"VjCD0100".to_vec()),
                MOLFILE => Some(prefixed_lines(MOL).unwrap()),
                _ => None,
            });
            assert!(c.cdxml.as_deref().is_some_and(|x| x.contains("<arrow/>")), "{cdx}");
            assert!(c.cdx.is_some() && c.molfile.is_some());
        }
        // Sam's dump of ChemDraw 22.2's copy (see export.rs reads_chemdraws_pdf).
        let Ok(dir) = std::env::var("OCTET_CLIPBOARD_DUMPS") else { return };
        let c = clip(|name| std::fs::read(format!("{dir}/chemdraw-copy/0_{name}")).ok());
        assert!(c.cdxml.unwrap().contains("<CDXML") && c.cdx.is_some() && c.molfile.is_some() && c.smiles.is_some());
    }

    // On a private pasteboard, so the user's clipboard is untouched.
    #[cfg(target_os = "macos")]
    #[test]
    fn pasteboard_keeps_type_order() {
        use objc2_app_kit::NSPasteboard;
        let pb = NSPasteboard::pasteboardWithUniqueName();
        let t = vec![(PDF, b"%PDF-1.7".to_vec()), (MOLFILE, prefixed_lines(MOL).unwrap()), (SMILES, b"CO\0".to_vec()), (OCTET, b"{}".to_vec())];
        mac::write(&pb, &t).unwrap();
        let names: Vec<String> = pb.types().unwrap().iter().map(|s| s.to_string()).collect();
        let ours: Vec<&str> = names.iter().map(String::as_str).filter(|n| t.iter().any(|(x, _)| x == n)).collect();
        assert_eq!(ours, [PDF, MOLFILE, SMILES, OCTET], "{names:?}");
        let c = mac::read(&pb);
        assert_eq!((c.octet.as_deref(), c.smiles.as_deref(), c.molfile.as_deref()), (Some("{}"), Some("CO"), Some(MOL)));
        pb.clearContents();
    }
}
