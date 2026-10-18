// File > Export… and the picture on the clipboard. The page sends a standalone SVG of the drawing at true size
// (src/export.ts); this makes a vector PDF or a PNG of it. The PDF carries the drawing's CDXML in its catalog
// /Metadata stream, as ChemDraw's does, so a picture pasted into Word and copied out again pastes back into
// Octet and ChemDraw as a structure. cdxml_from_pdf reads it back from any PDF, treated as hostile.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use base64::Engine;
use pdf_writer::{Content, Filter, Finish, Name, Pdf, Rect, Ref};
use svg2pdf::usvg::{self, fontdb};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const MAX_SVG: usize = 64 << 20;
const MAX_PDF: usize = 64 << 20;
const MAX_XML: usize = 32 << 20;

// The system's fonts, loaded once. Labels are embedded from them as subsets (Arial on the Mac).
fn fonts() -> Arc<fontdb::Database> {
    static FONTS: OnceLock<Arc<fontdb::Database>> = OnceLock::new();
    FONTS.get_or_init(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        Arc::new(db)
    }).clone()
}

// Every font family on the computer, for the font lists, as ChemDraw's Font menu lists every installed font. Hidden
// system fonts (their names start with a dot) are left out.
#[tauri::command]
pub async fn system_fonts() -> Vec<String> {
    let mut names: Vec<String> = fonts()
        .faces()
        .filter_map(|f| f.families.first().map(|(n, _)| n.trim().to_string()))
        .filter(|n| !n.is_empty() && !n.starts_with('.') && n.len() <= 64)
        .collect();
    names.sort_by_cached_key(|n| n.to_lowercase());
    names.dedup();
    names
}

fn tree(svg: &str) -> Result<usvg::Tree, String> {
    if svg.len() > MAX_SVG {
        return Err("This drawing is too large to export.".into());
    }
    let mut opt = usvg::Options::default();
    opt.fontdb = fonts();
    // usvg reads <image> files from disk by default. The picture holds only what the page drew.
    opt.image_href_resolver.resolve_string = Box::new(|_, _| None);
    usvg::Tree::from_str(svg, &opt).map_err(|e| {
        eprintln!("usvg: {e}");
        "Octet cannot draw this picture.".to_string()
    })
}

// The CDXML as ChemDraw hides it: the XML declaration at byte 0 and the CDXML DOCTYPE on line 2.
fn cdxml_document(cdxml: &str) -> String {
    let mut s = cdxml.trim_start_matches('\u{feff}').trim_start();
    if s.starts_with("<?xml") {
        s = s.find("?>").map_or(s, |k| &s[k + 2..]).trim_start();
    }
    if s.starts_with("<!DOCTYPE") {
        s = s.find('>').map_or(s, |k| &s[k + 1..]).trim_start();
    }
    format!("<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n<!DOCTYPE CDXML SYSTEM \"http://www.cambridgesoft.com/xml/cdxml.dtd\" >\n{s}")
}

// A vector PDF of the SVG at true size: the page is the SVG's box (1 pt per pt, CSS units honoured), text stays
// text in embedded font subsets, and nothing paints the background. With CDXML, the catalog gets a /Metadata
// stream holding it (/Type /Metadata /Subtype /XML, Flate, /Vendor /org.octet).
pub fn make_pdf(svg: &str, cdxml: Option<&str>) -> Result<Vec<u8>, String> {
    let tree = tree(svg)?;
    let (chunk, picture) = svg2pdf::to_chunk(&tree, svg2pdf::ConversionOptions::default()).map_err(|e| e.to_string())?;
    let mut alloc = Ref::new(1);
    let [catalog, pages, page, content, meta] = [(); 5].map(|_| alloc.bump());
    let mut map = HashMap::new();
    let chunk = chunk.renumber(|old| *map.entry(old).or_insert_with(|| alloc.bump()));
    // usvg measures in CSS px (96 to the inch); PDF in points (72). Rounded, so 86 pt stays 86, not 85.99999.
    let pt = |px: f32| (px * 750.0).round() / 1000.0;
    let (w, h) = (pt(tree.size().width()), pt(tree.size().height()));

    let mut pdf = Pdf::new();
    let mut cat = pdf.catalog(catalog);
    cat.pages(pages);
    if cdxml.is_some() {
        cat.metadata(meta);
    }
    cat.finish();
    pdf.pages(pages).kids([page]).count(1);
    let mut p = pdf.page(page);
    p.media_box(Rect::new(0.0, 0.0, w, h)).parent(pages).contents(content);
    p.resources().x_objects().pair(Name(b"S"), map[&picture]);
    p.finish();
    let mut c = Content::new();
    c.save_state().transform([w, 0.0, 0.0, h, 0.0, 0.0]).x_object(Name(b"S")).restore_state();
    pdf.stream(content, &c.finish());
    pdf.extend(&chunk);
    if let Some(x) = cdxml {
        let data = miniz_oxide::deflate::compress_to_vec_zlib(cdxml_document(x).as_bytes(), 6);
        pdf.metadata(meta, &data).filter(Filter::FlateDecode).pair(Name(b"Vendor"), Name(b"org.octet"));
    }
    Ok(pdf.finish())
}

// A PNG of the SVG at `dpi` (of its true size), white or transparent behind. It records its resolution, so
// Word, PowerPoint and Keynote place it at true size.
pub fn make_png(svg: &str, dpi: f32, transparent: bool) -> Result<Vec<u8>, String> {
    use resvg::tiny_skia::{Color, Pixmap, Transform};
    let tree = tree(svg)?;
    let dpi = if dpi.is_finite() { dpi.clamp(36.0, 2400.0) } else { 300.0 };
    let scale = dpi / 96.0;
    let (w, h) = ((tree.size().width() * scale).ceil() as u32, (tree.size().height() * scale).ceil() as u32);
    let too_big = "This picture is too large for a PNG at this resolution. Choose a lower resolution.";
    if w > 20_000 || h > 20_000 || u64::from(w) * u64::from(h) > 100_000_000 {
        return Err(too_big.into());
    }
    let mut pixmap = Pixmap::new(w.max(1), h.max(1)).ok_or(too_big)?;
    if !transparent {
        pixmap.fill(Color::WHITE);
    }
    resvg::render(&tree, Transform::from_scale(scale, scale), &mut pixmap.as_mut());
    let rgba: Vec<u8> = pixmap.pixels().iter().flat_map(|p| {
        let c = p.demultiply();
        [c.red(), c.green(), c.blue(), c.alpha()]
    }).collect();
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, pixmap.width(), pixmap.height());
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let ppm = (dpi / 0.0254).round() as u32;
    enc.set_pixel_dims(Some(png::PixelDimensions { xppu: ppm, yppu: ppm, unit: png::Unit::Meter }));
    let mut writer = enc.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&rgba).map_err(|e| e.to_string())?;
    writer.finish().map_err(|e| e.to_string())?;
    Ok(out)
}

// What File > Export… can write: id, name in the Save dialog, extensions (the first is the default).
const FORMATS: [(&str, &str, &[&str]); 8] = [
    ("oct", "Octet drawing", &["oct"]),
    ("pdf", "PDF", &["pdf"]),
    ("svg", "SVG", &["svg"]),
    ("png", "PNG", &["png"]),
    ("cdxml", "ChemDraw XML (CDXML)", &["cdxml"]),
    ("mol", "MDL Molfile", &["mol"]),
    ("sdf", "SD File", &["sdf"]),
    ("smi", "SMILES", &["smi", "smiles"]),
];

#[derive(serde::Deserialize)]
pub struct Export {
    name: String,
    format: Option<String>,
    oct: Option<String>,
    svg: Option<String>,
    cdxml: Option<String>,
    molfile: Option<String>,
    sdf: Option<String>,
    smiles: Option<String>,
    dpi: Option<f32>,
    transparent: Option<bool>,
}

// Files exported this session. The page can ask to show one of them in the file manager (reveal_file), never
// another file.
#[derive(Default)]
pub struct Exported(pub Mutex<HashSet<PathBuf>>);

// File > Export…: asks where to save, then writes the format the file name's extension asks for. The page sends
// the drawing in every form it has; the Save dialog offers those (or only `format`, if given). The page never
// names a path, so Octet writes only where the user chose. Returns the path, or None if cancelled.
#[tauri::command]
pub async fn export_file(app: AppHandle, exported: State<'_, Exported>, export: Export) -> Result<Option<String>, String> {
    let e = export;
    let has = |id: &str| match id {
        "oct" => e.oct.is_some(),
        "pdf" | "svg" | "png" => e.svg.is_some(),
        "cdxml" => e.cdxml.is_some(),
        "mol" => e.molfile.is_some(),
        "sdf" => e.sdf.is_some(),
        _ => e.smiles.is_some(),
    };
    let offered: Vec<_> = FORMATS.iter().filter(|f| has(f.0) && e.format.as_deref().is_none_or(|x| x == f.0)).collect();
    let Some(first) = offered.first() else {
        return Err("There is nothing to export in this format.".into());
    };
    let stem: String = e.name.trim_end_matches(".octet").chars().filter(|c| !c.is_control() && !matches!(c, '/' | '\\' | ':')).take(100).collect();
    let stem = if stem.trim().is_empty() { "Untitled".into() } else { stem };
    let mut dialog = app.dialog().file().set_file_name(format!("{stem}.{}", first.2[0]));
    for f in &offered {
        dialog = dialog.add_filter(f.1, f.2);
    }
    let Some(file) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let mut path: PathBuf = file.into_path().map_err(|e| e.to_string())?;
    let ext = path.extension().and_then(|x| x.to_str()).map(str::to_ascii_lowercase);
    let format = match offered.iter().find(|f| ext.as_deref().is_some_and(|x| f.2.contains(&x))) {
        Some(f) => f.0,
        None => {
            path.as_mut_os_string().push(format!(".{}", first.2[0]));
            first.0
        }
    };
    let text = |s: &Option<String>| s.clone().unwrap_or_default().into_bytes();
    let bytes = match format {
        "pdf" => make_pdf(e.svg.as_deref().unwrap_or_default(), e.cdxml.as_deref())?,
        "svg" => format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n{}\n", e.svg.as_deref().unwrap_or_default()).into_bytes(),
        "png" => make_png(e.svg.as_deref().unwrap_or_default(), e.dpi.unwrap_or(300.0), e.transparent.unwrap_or(false))?,
        "oct" => text(&e.oct),
        "cdxml" => text(&e.cdxml),
        "mol" => text(&e.molfile),
        "sdf" => text(&e.sdf),
        _ => format!("{}\n", e.smiles.as_deref().unwrap_or_default().trim()).into_bytes(),
    };
    crate::write_atomic(&path, &bytes).map_err(|e| e.to_string())?;
    exported.0.lock().unwrap().insert(path.clone());
    Ok(Some(path.to_string_lossy().into_owned()))
}

// ---- Reading CDXML back out of a PDF: Octet's, ChemDraw's, or either after Word ----
// The PDF is hostile: every index is checked, nothing recurses, a dictionary is read from at most 16 KB,
// at most 10,000 objects are looked at, and inflating stops at 32 MB.

// The drawing's CDXML in a PDF: the catalog's /Metadata, then any /Type /Metadata /Subtype /XML stream, then
// Octet's first test form (base64 CDXML in the document info /Keywords). Clipboard spec 4.3 and 4.4.
pub fn cdxml_from_pdf(pdf: &[u8]) -> Option<String> {
    if pdf.len() > MAX_PDF || !pdf.starts_with(b"%PDF") {
        return None;
    }
    let catalog = rfind(pdf, b"/Root").and_then(|i| reference(pdf, i + 5)).and_then(|(n, _)| object(pdf, n));
    let meta = catalog.and_then(|at| dict(pdf, at)).and_then(|(d, _)| match get(&d, b"Metadata") {
        Some(Val::Ref(n)) => object(pdf, *n),
        _ => None,
    });
    if let Some(s) = meta.and_then(|at| xml_stream(pdf, at, false)) {
        return Some(s);
    }
    let headers = (0..pdf.len().saturating_sub(2)).filter(|&i| &pdf[i..i + 3] == b"obj" && obj_header(pdf, i));
    if let Some(s) = headers.take(10_000).find_map(|i| xml_stream(pdf, i + 3, true)) {
        return Some(s);
    }
    let i = find(pdf, b"octet-cdxml-base64:")? + 19;
    let end = pdf[i..].iter().position(|c| !(c.is_ascii_alphanumeric() || b"+/=".contains(c))).map_or(pdf.len(), |k| i + k);
    let raw = base64::engine::general_purpose::STANDARD.decode(&pdf[i..end]).ok()?;
    is_cdxml(&raw).then(|| String::from_utf8_lossy(&raw).into_owned())
}

// CDXML starts with the XML declaration (after an optional byte order mark) and names CDXML near the top.
// Laxer than ChemDraw (which wants the DOCTYPE in the first 256 bytes); the CDXML is read as hostile anyway.
fn is_cdxml(head: &[u8]) -> bool {
    let head = &head[..head.len().min(1024)];
    let s = head.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(head);
    let s = &s[s.iter().position(|c| !c.is_ascii_whitespace()).unwrap_or(s.len())..];
    s.starts_with(b"<?xml") && (find(s, b"<!DOCTYPE CDXML").is_some() || find(s, b"<CDXML").is_some())
}

// The stream of the object whose dictionary starts at `at`, decoded, if it is CDXML. With `marked`, only a
// stream whose dictionary says /Type /Metadata (or /MetaData) and /Subtype /XML.
fn xml_stream(pdf: &[u8], at: usize, marked: bool) -> Option<String> {
    let (d, end) = dict(pdf, at)?;
    let name = |k: &[u8]| match get(&d, k) {
        Some(Val::Name(n)) => Some(*n),
        _ => None,
    };
    if marked && !(matches!(name(b"Type"), Some(b"Metadata" | b"MetaData")) && name(b"Subtype") == Some(b"XML")) {
        return None;
    }
    let flate = match get(&d, b"Filter") {
        None => false,
        Some(Val::Name(b"FlateDecode")) => true,
        Some(Val::Array(a)) if names(a) == [b"FlateDecode".as_slice()] => true,
        Some(Val::Array(a)) if names(a).is_empty() => false,
        _ => return None,
    };
    // The data starts after "stream" and its line end. /Length says where it ends, if it agrees with the
    // "endstream" there; otherwise the first "endstream" does.
    let mut i = skip_white(pdf, end);
    if word(pdf, i) != b"stream" {
        return None;
    }
    i += 6;
    i += usize::from(pdf.get(i) == Some(&b'\r'));
    i += usize::from(pdf.get(i) == Some(&b'\n'));
    let length = match get(&d, b"Length") {
        Some(Val::Int(n)) => Some(*n),
        Some(Val::Ref(r)) => object(pdf, *r).and_then(|j| int(pdf, skip_white(pdf, j))).map(|(n, _)| n),
        _ => None,
    };
    let stated = length.and_then(|n| i.checked_add(usize::try_from(n).ok()?)).filter(|&e| e <= pdf.len() && word(pdf, skip_white(pdf, e)) == b"endstream");
    let end = stated.or_else(|| {
        let mut e = i + find(pdf.get(i..)?, b"endstream")?;
        e -= usize::from(e > i && pdf[e - 1] == b'\n');
        e -= usize::from(e > i && pdf[e - 1] == b'\r');
        Some(e)
    })?;
    let data = &pdf[i..end];
    if !flate {
        return (data.len() <= MAX_XML && is_cdxml(data)).then(|| String::from_utf8_lossy(data).into_owned());
    }
    use miniz_oxide::inflate::{decompress_to_vec_zlib_with_limit as inflate, TINFLStatus};
    // Look at the start first, so a large stream that is not CDXML is never inflated in full.
    let head = match inflate(data, 1024) {
        Ok(v) => v,
        Err(e) if e.status == TINFLStatus::HasMoreOutput => e.output,
        Err(_) => return None,
    };
    if !is_cdxml(&head) {
        return None;
    }
    inflate(data, MAX_XML).ok().map(|v| String::from_utf8_lossy(&v).into_owned())
}

fn find(h: &[u8], n: &[u8]) -> Option<usize> {
    h.windows(n.len()).position(|w| w == n)
}

fn rfind(h: &[u8], n: &[u8]) -> Option<usize> {
    h.windows(n.len()).rposition(|w| w == n)
}

fn is_white(c: u8) -> bool {
    matches!(c, b' ' | b'\t' | b'\r' | b'\n' | b'\x0c' | 0)
}

fn is_delim(c: u8) -> bool {
    matches!(c, b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' | b'/' | b'%')
}

// Past whitespace and comments.
fn skip_white(b: &[u8], mut i: usize) -> usize {
    while let Some(&c) = b.get(i) {
        if is_white(c) {
            i += 1;
        } else if c == b'%' {
            while b.get(i).is_some_and(|&c| c != b'\n' && c != b'\r') {
                i += 1;
            }
        } else {
            break;
        }
    }
    i
}

// The regular characters from `i` up to whitespace or a delimiter.
fn word(b: &[u8], i: usize) -> &[u8] {
    let Some(rest) = b.get(i..) else { return &[] };
    &rest[..rest.iter().position(|&c| is_white(c) || is_delim(c)).unwrap_or(rest.len())]
}

fn int(b: &[u8], i: usize) -> Option<(u64, usize)> {
    let w = word(b, i);
    if w.is_empty() || w.len() > 12 || !w.iter().all(u8::is_ascii_digit) {
        return None;
    }
    Some((std::str::from_utf8(w).ok()?.parse().ok()?, i + w.len()))
}

// "N G R" at `i`: the object number, and where the reference ends.
fn reference(b: &[u8], i: usize) -> Option<(u32, usize)> {
    let (n, j) = int(b, skip_white(b, i))?;
    let (_, j) = int(b, skip_white(b, j))?;
    let j = skip_white(b, j);
    if word(b, j) != b"R" {
        return None;
    }
    Some((u32::try_from(n).ok()?, j + 1))
}

// Whether the "obj" at `i` follows "N G " (and so is not "endobj").
fn obj_header(b: &[u8], i: usize) -> bool {
    let back_white = |mut j: usize| {
        while j > 0 && is_white(b[j - 1]) {
            j -= 1;
        }
        j
    };
    let back_digits = |mut j: usize| {
        while j > 0 && b[j - 1].is_ascii_digit() {
            j -= 1;
        }
        j
    };
    let after = b.get(i + 3).is_none_or(|&c| is_white(c) || is_delim(c));
    let j = back_white(i);
    let k = back_digits(j);
    let l = back_white(k);
    let m = back_digits(l);
    after && j < i && k < j && l < k && m < l && (m == 0 || is_white(b[m - 1]))
}

// Where object `n`'s body starts (after "n g obj"). The last definition wins, as in an updated PDF.
fn object(b: &[u8], n: u32) -> Option<usize> {
    let pat = format!("{n} ");
    let pat = pat.as_bytes();
    let mut found = None;
    let mut from = 0;
    while let Some(k) = b.get(from..).and_then(|rest| find(rest, pat)) {
        let i = from + k;
        from = i + 1;
        if i == 0 || !is_white(b[i - 1]) {
            continue;
        }
        if let Some((_, j)) = int(b, skip_white(b, i + pat.len())) {
            let j = skip_white(b, j);
            if word(b, j) == b"obj" {
                found = Some(j + 3);
            }
        }
    }
    found
}

enum Val<'a> {
    Name(&'a [u8]),
    Int(u64),
    Ref(u32),
    Array(&'a [u8]),
    Other,
}

fn get<'a, 'b>(d: &'b [(&'a [u8], Val<'a>)], key: &[u8]) -> Option<&'b Val<'a>> {
    d.iter().find(|(k, _)| *k == key).map(|(_, v)| v)
}

// The names in an array's bytes, such as [/FlateDecode].
fn names(a: &[u8]) -> Vec<&[u8]> {
    a.split(|&c| c == b'/').skip(1).map(|s| word(s, 0)).collect()
}

// The dictionary starting at `at` (after whitespace): its entries, and where it ends.
fn dict(b: &[u8], at: usize) -> Option<(Vec<(&[u8], Val<'_>)>, usize)> {
    let b = &b[..b.len().min(at.saturating_add(16 << 10))];
    let mut i = skip_white(b, at);
    if b.get(i..i + 2)? != b"<<" {
        return None;
    }
    i += 2;
    let mut out = Vec::new();
    loop {
        i = skip_white(b, i);
        if b.get(i..i + 2)? == b">>" {
            return Some((out, i + 2));
        }
        if *b.get(i)? != b'/' {
            return None;
        }
        let key = word(b, i + 1);
        i = skip_white(b, i + 1 + key.len());
        let (val, next) = value(b, i)?;
        out.push((key, val));
        i = next;
    }
}

fn value(b: &[u8], i: usize) -> Option<(Val<'_>, usize)> {
    match *b.get(i)? {
        b'/' => {
            let w = word(b, i + 1);
            Some((Val::Name(w), i + 1 + w.len()))
        }
        b'<' if b.get(i + 1) == Some(&b'<') => Some((Val::Other, skip_nested(b, i)?)),
        b'[' => {
            let end = skip_nested(b, i)?;
            Some((Val::Array(&b[i + 1..end - 1]), end))
        }
        b'<' => Some((Val::Other, i + 1 + b.get(i + 1..)?.iter().position(|&c| c == b'>')? + 1)),
        b'(' => Some((Val::Other, skip_string(b, i)?)),
        c if c.is_ascii_digit() => {
            if let Some((r, end)) = reference(b, i) {
                return Some((Val::Ref(r), end));
            }
            if let Some((n, end)) = int(b, i) {
                return Some((Val::Int(n), end));
            }
            Some((Val::Other, i + word(b, i).len().max(1)))
        }
        _ => {
            let w = word(b, i);
            (!w.is_empty()).then_some((Val::Other, i + w.len()))
        }
    }
}

// Past a literal string "( ... )", with nested brackets and backslash escapes.
fn skip_string(b: &[u8], mut i: usize) -> Option<usize> {
    let mut depth = 0usize;
    loop {
        match *b.get(i)? {
            b'\\' => i += 1,
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i + 1);
                }
            }
            _ => {}
        }
        i += 1;
    }
}

// Past a nested dictionary "<< ... >>" or array "[ ... ]", counting depth instead of recursing.
fn skip_nested(b: &[u8], mut i: usize) -> Option<usize> {
    let mut depth = 0usize;
    loop {
        match *b.get(i)? {
            b'(' => i = skip_string(b, i)?,
            b'<' if b.get(i + 1) == Some(&b'<') => {
                depth += 1;
                i += 2;
            }
            b'<' => i += 1 + b.get(i + 1..)?.iter().position(|&c| c == b'>')? + 1,
            b'>' if b.get(i + 1) == Some(&b'>') => {
                depth = depth.checked_sub(1)?;
                i += 2;
                if depth == 0 {
                    return Some(i);
                }
            }
            b'[' => {
                depth += 1;
                i += 1;
            }
            b']' => {
                depth = depth.checked_sub(1)?;
                i += 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            b'%' => i = skip_white(b, i),
            _ => i += 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="86pt" height="65pt" viewBox="0 0 86 65">
        <path d="M10 10L60 10L60 12L10 12Z" fill="rgb(15, 23, 42)"/>
        <text x="20" y="40" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="rgb(15, 23, 42)">NH<tspan baseline-shift="sub" font-size="7.5">2</tspan></text>
    </svg>"##;
    const CDXML: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n<!DOCTYPE CDXML SYSTEM \"http://www.cambridgesoft.com/xml/cdxml.dtd\" >\n<CDXML><page><fragment/></page></CDXML>\n";

    #[test]
    fn pdf_carries_cdxml_and_reads_back() {
        let pdf = make_pdf(SVG, Some(CDXML)).unwrap();
        assert_eq!(cdxml_from_pdf(&pdf).as_deref(), Some(CDXML));
        // The catalog points at the stream, which is marked as ChemDraw marks its own.
        let text = String::from_utf8_lossy(&pdf);
        assert!(text.contains("/Type /Catalog"));
        assert!(find(&pdf, b"/Metadata").is_some() && find(&pdf, b"/Subtype /XML").is_some() && find(&pdf, b"/Vendor /org.octet").is_some());
        // True size: 86 x 65 pt.
        assert!(text.contains("/MediaBox [0 0 86 65]"), "{}", &text[..text.len().min(2000)]);
        // Labels are text in an embedded font subset.
        assert!(text.contains("/FontFile2"));
        #[cfg(target_os = "macos")]
        assert!(text.contains("+ArialMT"));
    }

    #[test]
    fn cdxml_takes_chemdraws_header() {
        let doc = cdxml_document("\u{feff}<?xml version=\"1.0\"?>\n<!DOCTYPE CDXML SYSTEM \"x\">\n<CDXML/>");
        assert!(doc.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n<!DOCTYPE CDXML SYSTEM \"http://www.cambridgesoft.com/xml/cdxml.dtd\" >\n<CDXML/>"));
        assert_eq!(cdxml_document("<CDXML/>"), doc);
    }

    #[test]
    fn pdf_without_cdxml_has_no_metadata() {
        let pdf = make_pdf(SVG, None).unwrap();
        assert!(find(&pdf, b"/Metadata").is_none());
        assert_eq!(cdxml_from_pdf(&pdf), None);
    }

    #[test]
    fn finds_marked_stream_without_catalog_entry() {
        // An uncompressed metadata stream that the catalog does not name, with an indirect /Length.
        let body = CDXML.as_bytes();
        let pdf = [
            b"%PDF-1.3\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n".as_slice(),
            b"5 0 obj\n<< /Length 6 0 R /Type /Metadata /Subtype /XML >>\nstream\n",
            body,
            format!("\nendstream\nendobj\n6 0 obj\n{}\nendobj\ntrailer\n<< /Size 7 /Root 1 0 R >>\n%%EOF\n", body.len()).as_bytes(),
        ].concat();
        assert_eq!(cdxml_from_pdf(&pdf).as_deref(), Some(CDXML));
    }

    #[test]
    fn hostile_pdfs_are_refused_quietly() {
        for pdf in [
            b"%PDF-1.4\n1 0 obj << /Metadata 1 0 R".as_slice(),
            b"%PDF trailer << /Root 99999999999 0 R >>",
            b"%PDF\n1 0 obj << /Type /Metadata /Subtype /XML /Length 999999 /Filter /FlateDecode >>\nstream\nxx",
            b"%PDF\n1 0 obj << /A << /B << [ ( ) ) ] >> >> /Type",
            b"%PDF\n1 0 obj << /Type /Metadata /Subtype /XML /Filter [/LZWDecode] /Length 3 >>\nstream\nabc\nendstream",
            b"%PDF octet-cdxml-base64:!!!",
        ] {
            assert_eq!(cdxml_from_pdf(pdf), None);
        }
        // A zip bomb that starts like CDXML stops at the 32 MB cap.
        let mut big = CDXML.as_bytes().to_vec();
        big.resize(40 << 20, b' ');
        let bomb = miniz_oxide::deflate::compress_to_vec_zlib(&big, 1);
        let pdf = [b"%PDF\n1 0 obj << /Type /Metadata /Subtype /XML /Filter /FlateDecode >>\nstream\n".as_slice(), &bomb, b"\nendstream"].concat();
        assert_eq!(cdxml_from_pdf(&pdf), None);
    }

    #[test]
    fn png_is_true_size_at_the_resolution() {
        let png = make_png(SVG, 300.0, true).unwrap();
        let header = png::Decoder::new(std::io::Cursor::new(png)).read_info().unwrap().info().clone();
        // 86 pt at 300 dpi.
        assert_eq!((header.width, header.height), (359, 271));
        assert_eq!(header.pixel_dims.unwrap().xppu, 11811);
    }

    // Sam's clipboard dumps (ChemDraw's copy, and it copied back out of Word). Set OCTET_CLIPBOARD_DUMPS to the
    // folder holding chemdraw-copy/ and word-copy/ to run this; the files stay out of the repository.
    #[test]
    fn reads_chemdraws_pdf() {
        let Ok(dir) = std::env::var("OCTET_CLIPBOARD_DUMPS") else { return };
        for sub in ["chemdraw-copy", "word-copy"] {
            let pdf = std::fs::read(format!("{dir}/{sub}/0_com.adobe.pdf")).unwrap();
            let x = cdxml_from_pdf(&pdf).unwrap();
            assert!(x.contains("<CDXML"), "{sub}");
        }
        let old = std::fs::read(format!("{dir}/word-octet-pdf/0_com.adobe.pdf")).unwrap();
        assert!(cdxml_from_pdf(&old).unwrap().contains("<CDXML"));
    }
}
