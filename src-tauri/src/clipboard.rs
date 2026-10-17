// Copy and paste with Word, PowerPoint, Keynote and ChemDraw, as ChemDraw's own clipboard works (macOS).
// Copy puts one pasteboard item holding, in this order: a vector PDF of the selection with its CDXML in the
// catalog /Metadata (Office keeps it; ChemDraw and Octet read the structure back out of it), a molfile as
// length-prefixed lines, SMILES with a NUL, and Octet's own JSON for a lossless paste into Octet.
// No plain text: ChemDraw reads text before pictures and would paste it as a caption.
// Not yet: ChemDraw's CDX type, which ChemDraw reads first. Octet has no CDX writer yet.
//
// WebKit keeps the page's own clipboard types in a blob of its own and shows a page only text, HTML and URLs
// from other apps, so the page cannot read these types itself: paste calls read_clipboard.

pub const PDF: &str = "com.adobe.pdf";
pub const CDX: [&str; 2] = ["com.perkinelmer.chemdraw.cdx-clipboard", "com.cambridgesoft.cdx"];
pub const CDXML: &str = "com.perkinelmer.cdxml";
pub const MOLFILE: &str = "com.mdli.molfile";
pub const SMILES: &str = "org.opensmiles.smiles";
// Plain text, for Name to Structure (the name field opens with a name copied from elsewhere).
pub const TEXT: &str = "public.utf8-plain-text";
// Octet's own type. A UTI under the app's identifier: macOS refuses MIME-style names such as
// application/x-octet+json on the pasteboard.
pub const OCTET: &str = "io.github.samchemman.octet.json";

const MAX_TYPE: usize = 64 << 20;
const MAX_TEXT: usize = 64 << 10;

// What paste found on the clipboard. Each is None when absent or unreadable.
#[derive(serde::Serialize, Default, Debug, PartialEq)]
pub struct Clip {
    octet: Option<String>,   // Octet's own JSON
    cdxml: Option<String>,   // CDXML: ChemDraw's CDXML type, or hidden in a PDF (Octet's, ChemDraw's, or either after Word)
    cdx: Option<String>,     // ChemDraw's CDX, base64
    molfile: Option<String>, // a molfile or RXN file, with LF line ends
    smiles: Option<String>,
    text: Option<String>,    // plain text of 64 KB or less
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

// The types for one copy, in ChemDraw's order.
fn types(svg: &str, cdxml: Option<&str>, molfile: Option<&str>, smiles: Option<&str>, octet_json: Option<String>) -> Result<Vec<(&'static str, Vec<u8>)>, String> {
    let mut out = vec![(PDF, crate::export::make_pdf(svg, cdxml)?)];
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
        text: read(TEXT).filter(|b| b.len() <= MAX_TEXT).and_then(|b| String::from_utf8(b).ok()),
    };
    // The PDF only matters when nothing better is there.
    if c.octet.is_none() && c.cdxml.is_none() && c.cdx.is_none() {
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

// Copy: the selection as a PDF picture (with its CDXML hidden in it), a molfile, SMILES and Octet's JSON.
#[tauri::command]
pub async fn copy_to_clipboard(svg: String, cdxml: Option<String>, molfile: Option<String>, smiles: Option<String>, octet_json: Option<String>) -> Result<(), String> {
    let types = types(&svg, cdxml.as_deref(), molfile.as_deref(), smiles.as_deref(), octet_json)?;
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
        let t = types(svg, Some("<CDXML/>"), Some(MOL), Some("CO"), Some("{}".into())).unwrap();
        assert_eq!(t.iter().map(|(t, _)| *t).collect::<Vec<_>>(), [PDF, MOLFILE, SMILES, OCTET]);
        assert_eq!(t[2].1, b"CO\0");
        // Paste reads them all back; the PDF is not needed when Octet's JSON is there.
        let read = |name: &str| t.iter().find(|(n, _)| *n == name).map(|(_, b)| b.clone());
        let c = clip(read);
        assert_eq!((c.octet.as_deref(), c.molfile.as_deref(), c.smiles.as_deref(), c.cdxml.as_deref()), (Some("{}"), Some(MOL), Some("CO"), None));
        // Plain text (a name copied from a paper) comes through for the name field, unless it is too long.
        assert_eq!(clip(|name| (name == TEXT).then(|| b"aspirin".to_vec())).text.as_deref(), Some("aspirin"));
        assert_eq!(clip(|name| (name == TEXT).then(|| vec![b'a'; MAX_TEXT + 1])).text, None);
        // Without it (a picture copied back out of Word), the CDXML comes out of the PDF.
        let c = clip(|name| (name == PDF).then(|| t[0].1.clone()));
        assert!(c.cdxml.unwrap().contains("<CDXML/>"));
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
        assert_eq!((c.octet.as_deref(), c.smiles.as_deref(), c.molfile.as_deref(), c.text.as_deref()), (Some("{}"), Some("CO"), Some(MOL), None));
        pb.clearContents();
    }
}
