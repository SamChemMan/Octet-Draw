// Tests of the Office object's EMF (make_office_emf, issue 166): its EMF+ records read back by MS-EMFPLUS, checked
// against its GDI records, which are make_emf's. The tests with "ole" in their names need Windows: GDI and GDI+ draw
// the EMFs into bitmaps there, in the Office objects job (platforms.yml runs the tests with "ole" in their names).

use super::tests::{picture_svg, PROLINE};
use super::*;

const X: &str = "<CDXML><page><fragment><n id=\"1\"/></fragment></page></CDXML>";
const EMF_PLUS: u32 = 0x2B46_4D45;

// The drawings both streams are checked on: what a drawing can hold. None has a picture (photo_drawings has those).
pub(crate) fn drawings() -> Vec<(&'static str, String)> {
    let page = |w: f32, h: f32, body: &str| format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}pt" height="{h}pt" viewBox="0 0 {w} {h}">{body}</svg>"##);
    let arial = r#"font-family="Arial, Helvetica, sans-serif""#;
    vec![
        ("a line and a box", super::tests::SVG.to_string()),
        ("L-proline, with labels", PROLINE.to_string()),
        ("labels with sub- and superscripts", r##"<svg xmlns="http://www.w3.org/2000/svg" width="120pt" height="72pt" viewBox="0 0 120 72"><g transform="scale(0.75)"><path d="M0 0h20v1h-20z" fill="#000"/><g font-family="Arial, Helvetica, sans-serif" font-size="13.3333px" fill="rgb(15, 23, 42)"><text x="20" y="30">NH</text><text x="20" y="50">OH</text><text x="60" y="30">H</text><text x="69.62890625" y="30">O</text><text x="100" y="30">O</text><text x="80" y="60">CH<tspan dy="2.827" font-size="10px">3</tspan></text><text x="20" y="80">NH<tspan dy="-4" font-size="10px">+</tspan></text></g></g></svg>"##.to_string()),
        ("a dashed curved arrow with round caps", page(100.0, 60.0, r##"<path d="M10 40C30 10 60 10 80 40" fill="none" stroke="#000" stroke-width="1" stroke-dasharray="3 2" stroke-linecap="round"/><path d="M80 40l-6-1l3-4z" fill="#000"/>"##)),
        ("square-capped dashes from an offset, and dots", page(100.0, 40.0, r##"<path d="M10 10H90" stroke="#C00" stroke-width="2" stroke-dasharray="4 3" stroke-dashoffset="1" stroke-linecap="square"/><path d="M10 25H90" stroke="#00C" stroke-width="2" stroke-dasharray="0 4" stroke-linecap="round"/><path d="M10 35H90" stroke="#000" stroke-width="1" stroke-dasharray="1 0.5" stroke-linecap="square"/>"##)),
        ("a 0.1 pt hairline, a 10 pt line and a miter join", page(100.0, 110.0, r##"<path d="M5 5L95 25" stroke="#000" stroke-width="0.1"/><path d="M5 50L95 50" stroke="#000" stroke-width="10"/><path d="M10 80L50 85L10 90" fill="none" stroke="#000" stroke-width="3" stroke-linejoin="miter" stroke-miterlimit="4"/><path d="M60 80L95 85L60 90" fill="none" stroke="#000" stroke-width="3" stroke-linejoin="bevel"/><path d="M10 100Q50 70 90 100" fill="none" stroke="#000" stroke-linejoin="round"/>"##)),
        ("an even-odd shape (an orbital's lobe)", page(100.0, 80.0, r##"<path d="M20 20h60v40h-60z M35 30h30v20h-30z" fill="#213C99" fill-rule="evenodd"/>"##)),
        ("overlapping fills in one nonzero path", page(60.0, 60.0, r##"<path d="M5 5h30v30h-30z M20 20h30v30h-30z" fill="rgb(15, 23, 42)"/>"##)),
        ("a structure turned 30 degrees and flipped, with labels", page(100.0, 80.0, &format!(r##"<g transform="translate(50 30) rotate(30) scale(-1 1)"><path d="M0 0L20 10L20 30Z" fill="rgb(15, 23, 42)"/><text x="22" y="12" {arial} font-size="10">OH</text></g>"##))),
        ("underlined text", page(80.0, 40.0, &format!(r##"<text x="10" y="20" {arial} font-size="10" text-decoration="underline">NH2</text>"##))),
        ("colour, part opacity, bold and italic", page(100.0, 40.0, &format!(r##"<rect x="5" y="5" width="40" height="20" fill="#FFD400" fill-opacity="0.4"/><g opacity="0.5"><path d="M50 5h40v20h-40z" fill="#000"/></g><text x="10" y="20" fill="#C00" {arial} font-size="10" font-weight="bold">N</text><text x="25" y="20" fill="#00C" {arial} font-style="italic" font-size="10">O</text><text x="40" y="35" fill="#080" {arial} font-size="10">Cl</text>"##))),
        ("one label of one letter", page(30.0, 20.0, &format!(r#"<text x="10" y="15" {arial} font-size="10">O</text>"#))),
        ("an empty drawing", page(72.0, 72.0, "")), // the object window's blank picture (Editor.tsx BLANK_SVG)
        ("a poster 2 m wide", page(5669.0, 100.0, &format!(r##"<path d="M10 50H5659" stroke="#000" stroke-width="1"/><path d="M5600 10h50v80h-50z" fill="#000"/><text x="5000" y="60" {arial} font-size="10">OH</text>"##))),
    ]
}

// Drawings with a picture in them: upright, and turned 30 degrees.
fn photo_drawings() -> Vec<(&'static str, String)> {
    let turned = picture_svg().replace(r#"<g transform="scale(1)">"#, r#"<g transform="rotate(30 36 18)">"#);
    vec![("a picture", picture_svg()), ("a picture turned 30 degrees", turned)]
}

// A drawing as Octet's export writes one (as PROLINE): in a group scaled 0.75, each structure one path of its bonds'
// outlines, and each atom label a text of one letter in Arial 13.3333px, all in rgb(15, 23, 42). A structure here is
// `bonds` bonds in a zig-zag of rows `per_row` bonds long: a single bond is a 5-point outline, every eighth a double bond
// (two 4-point outlines), and every twelfth a hashed wedge (6 hashes of 4 points); and a label every
// `bonds / labels` bonds. `count` structures in a grid. For the speed test: L-proline is PROLINE; paclitaxel 69 bonds
// and 20 labels; a 500-residue peptide one structure of 3,500 bonds and 1,500 labels, one path of about 25,000 points.
pub(crate) fn octet_drawing(count: usize, bonds: usize, labels: usize, per_row: usize) -> String {
    let (bond, rise, gap) = (20.0f32, 11.0f32, 26.0f32);
    let rows = bonds.div_ceil(per_row);
    let (sw, sh) = (per_row as f32 * bond * 0.87 + 40.0, rows as f32 * (rise + gap) + 40.0);
    let across = (count as f32).sqrt().ceil() as usize;
    let (pw, ph) = (across as f32 * sw, count.div_ceil(across) as f32 * sh);
    let mut svg = format!(r#"<svg xmlns="http://www.w3.org/2000/svg" fill="rgb(0, 0, 0)" width="{}pt" height="{}pt" viewBox="0 0 {} {}"><g transform="scale(0.75)">"#, pw * 0.75, ph * 0.75, pw * 0.75, ph * 0.75);
    let n = |v: f32| format!("{:.2}", v);
    for s in 0..count {
        let (ox, oy) = ((s % across) as f32 * sw + 20.0, (s / across) as f32 * sh + 20.0);
        let mut d = String::new();
        let mut text = String::new();
        let every = (bonds / labels.max(1)).max(1);
        for b in 0..bonds {
            let (row, col) = (b / per_row, b % per_row);
            let x0 = ox + col as f32 * bond * 0.87;
            let y0 = oy + row as f32 * (rise + gap) + if col % 2 == 0 { 0.0 } else { rise };
            let (x1, y1) = (x0 + bond * 0.87, y0 + if col % 2 == 0 { rise } else { -rise });
            let (dx, dy) = ((x1 - x0) / bond, (y1 - y0) / bond);
            let (nx, ny) = (-dy * 0.4, dx * 0.4);
            if b % 12 == 11 {
                for h in 1..=6 {
                    let t = h as f32 / 7.0;
                    let (cx, cy, w) = (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1.0 + 5.0 * t);
                    d += &format!("M{} {}L{} {}L{} {}L{} {}Z", n(cx - nx * w - dx * 0.4), n(cy - ny * w - dy * 0.4), n(cx + nx * w - dx * 0.4), n(cy + ny * w - dy * 0.4), n(cx + nx * w + dx * 0.4), n(cy + ny * w + dy * 0.4), n(cx - nx * w + dx * 0.4), n(cy - ny * w + dy * 0.4));
                }
            } else {
                d += &format!("M{} {}L{} {}L{} {}L{} {}L{} {}Z", n(x0 - nx), n(y0 - ny), n(x0 + nx), n(y0 + ny), n(x1 + nx), n(y1 + ny), n(x1 + dx * 0.3), n(y1 + dy * 0.3), n(x1 - nx), n(y1 - ny));
                if b % 8 == 7 {
                    let (ex, ey) = (nx * 9.0, ny * 9.0);
                    d += &format!("M{} {}L{} {}L{} {}L{} {}Z", n(x0 + ex - nx), n(y0 + ey - ny), n(x0 + ex + nx), n(y0 + ey + ny), n(x1 + ex + nx), n(y1 + ey + ny), n(x1 + ex - nx), n(y1 + ey - ny));
                }
            }
            if b % every == 0 && text.matches("<text").count() < labels {
                let letter = ["O", "N", "H", "O", "S"][(b / every) % 5];
                text += &format!(r#"<text x="{}" y="{}" fill="rgb(15, 23, 42)" font-family="Arial, Helvetica, sans-serif" font-size="13.3333px">{letter}</text>"#, n(x1 - 4.5), n(y1 + 4.8));
            }
        }
        svg += &format!(r#"<path d="{d}" fill="rgb(15, 23, 42)"/><g>{text}</g>"#);
    }
    svg + "</g></svg>"
}

fn u16_at(b: &[u8], k: usize) -> u16 {
    u16::from_le_bytes([b[k], b[k + 1]])
}
fn u32_at(b: &[u8], k: usize) -> u32 {
    u32::from_le_bytes(b[k..k + 4].try_into().unwrap())
}
fn i32_at(b: &[u8], k: usize) -> i32 {
    u32_at(b, k) as i32
}
fn f32_at(b: &[u8], k: usize) -> f32 {
    f32::from_bits(u32_at(b, k))
}

// The records of an EMF: (kind, where it starts, its size). They take the walk to the end, and the header's totals
// count them.
fn emf_records(emf: &[u8]) -> Vec<(u32, usize, usize)> {
    let (mut at, mut out) = (0, Vec::new());
    while at < emf.len() {
        let size = u32_at(emf, at + 4) as usize;
        assert!(size >= 8 && size % 4 == 0 && at + size <= emf.len(), "a record of {size} bytes at {at}");
        out.push((u32_at(emf, at), at, size));
        at += size;
    }
    assert_eq!((u32_at(emf, 48) as usize, u32_at(emf, 52) as usize), (emf.len(), out.len()), "the header's totals");
    out
}
fn is_plus(emf: &[u8], r: &(u32, usize, usize)) -> bool {
    r.0 == 70 && r.2 >= 16 && u32_at(emf, r.1 + 12) == EMF_PLUS
}

// What one drawing call draws, read back from either stream, in GDI's logical units (1/20 pt). A point's kind: 0 a
// figure's start, 1 a line, 3 a Bézier point, with 0x80 when it closes its figure.
#[derive(Debug)]
enum Op {
    Fill { points: Vec<(f64, f64, u8)>, rgb: u32, winding: bool },
    Stroke { points: Vec<(f64, f64, u8)>, rgb: u32, width: f64 },
    Text { face: String, height: f64, bold: bool, italic: bool, rgb: u32, chars: Vec<u16>, at: Vec<(f64, f64)>, end: f64 },
    Picture,
}

// The GDI records' drawing calls. Colours as 0xRRGGBB.
fn gdi_ops(emf: &[u8]) -> Vec<Op> {
    #[derive(Clone)]
    enum Object {
        Brush(u32),
        Pen(f64, u32),
        Font(String, f64, bool, bool),
    }
    let rgb = |c: u32| ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF);
    let mut objects: Vec<Option<Object>> = vec![None; 16];
    let (mut brush, mut pen, mut font) = (None, None, None);
    let (mut text_rgb, mut winding) = (0, false);
    let (mut points, mut start, mut open) = (Vec::new(), (0.0, 0.0), false);
    let mut out = Vec::new();
    for (kind, at, _) in emf_records(emf) {
        let v = |k: usize| f64::from(i32_at(emf, at + k));
        let mut add = |p: (f64, f64), kind: u8, points: &mut Vec<(f64, f64, u8)>| {
            if !open {
                points.push((start.0, start.1, 0));
                open = true;
            }
            points.push((p.0, p.1, kind));
        };
        match kind {
            39 => objects[u32_at(emf, at + 8) as usize] = Some(Object::Brush(rgb(u32_at(emf, at + 16)))),
            95 => objects[u32_at(emf, at + 8) as usize] = Some(Object::Pen(v(32), rgb(u32_at(emf, at + 40)))),
            82 => {
                let face: Vec<u16> = emf[at + 40..at + 104].chunks(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|c| *c != 0).collect();
                objects[u32_at(emf, at + 8) as usize] = Some(Object::Font(String::from_utf16(&face).unwrap(), -v(12), i32_at(emf, at + 28) >= 600, emf[at + 32] != 0));
            }
            37 => {
                let k = u32_at(emf, at + 8);
                match k {
                    0x8000_0005 => brush = None,
                    0x8000_0008 => pen = None,
                    0x8000_000D => font = None,
                    _ => match objects[k as usize].clone() {
                        Some(Object::Brush(c)) => brush = Some(c),
                        Some(Object::Pen(w, c)) => pen = Some((w, c)),
                        Some(f @ Object::Font(..)) => font = Some(f),
                        None => panic!("object {k} selected before it is made"),
                    },
                }
            }
            40 => objects[u32_at(emf, at + 8) as usize] = None,
            19 => winding = u32_at(emf, at + 8) == 2,
            24 => text_rgb = rgb(u32_at(emf, at + 8)),
            59 => {
                points = Vec::new();
                open = false;
            }
            27 => {
                start = (v(8), v(12));
                points.push((start.0, start.1, 0));
                open = true;
            }
            54 => add((v(8), v(12)), 1, &mut points),
            5 => {
                assert_eq!(u32_at(emf, at + 24), 3);
                for i in 0..3 {
                    add((v(28 + 8 * i), v(32 + 8 * i)), 3, &mut points);
                }
            }
            61 => {
                if open {
                    if let Some(p) = points.last_mut() {
                        p.2 |= 0x80;
                    }
                }
                open = false;
            }
            62 => out.push(Op::Fill { points: points.clone(), rgb: brush.expect("a brush"), winding }),
            64 => {
                let (width, rgb) = pen.expect("a pen");
                out.push(Op::Stroke { points: points.clone(), rgb, width });
            }
            84 => {
                let Some(Object::Font(face, height, bold, italic)) = font.clone() else { panic!("text with no font") };
                let n = u32_at(emf, at + 44) as usize;
                let (s, d) = (u32_at(emf, at + 48) as usize, u32_at(emf, at + 72) as usize);
                let chars: Vec<u16> = (0..n).map(|i| u16_at(emf, at + s + 2 * i)).collect();
                let (mut x, y) = (v(36), v(40));
                let mut xs = Vec::new();
                for i in 0..n {
                    xs.push((x, y));
                    x += f64::from(i32_at(emf, at + d + 4 * i));
                }
                out.push(Op::Text { face, height, bold, italic, rgb: text_rgb, chars, at: xs, end: x });
            }
            81 => out.push(Op::Picture),
            _ => {}
        }
    }
    out
}

// The EMF+ records' drawing calls, in logical units (px times 15), each record checked by MS-EMFPLUS as it is read:
// - the EMF+ header is the first record of the first record after the EMF's header, and there is one;
// - each comment's records fill it exactly, each one's size a multiple of 4 and its data's size its size less 12;
// - objects have ids 0 to 63, are never continued, and are defined before a record uses them;
// - a path's point and type counts agree, Bézier points come in threes after a figure's start, and its flags are only
//   the winding fill's;
// - a pen, a brush and a font are their exact sizes; DrawDriverString has an even number of characters;
// - EmfPlusEndOfFile is the last EMF+ record, in the last comment before EMR_EOF.
fn plus_ops(emf: &[u8]) -> Vec<Op> {
    let all = emf_records(emf);
    assert!(all.len() >= 4 && is_plus(emf, &all[1]), "the second record is an EMF+ comment");
    assert_eq!(all.last().unwrap().0, 14, "EMR_EOF ends the EMF");
    let mut objects: Vec<Option<(u16, Vec<u8>)>> = vec![None; 64];
    let mut out = Vec::new();
    let (mut headers, mut ended) = (0, false);
    let mut fill_in = None; // the comment of the last op, if it is a fill
    let comments: Vec<_> = all.iter().filter(|r| is_plus(emf, r)).collect();
    for (n, r) in comments.iter().enumerate() {
        let (_, at, size) = **r;
        assert_eq!(u32_at(emf, at + 8) as usize, size - 12, "the comment's data size");
        let data = &emf[at + 16..at + size];
        let mut k = 0;
        while k < data.len() {
            assert!(!ended, "a record after EmfPlusEndOfFile");
            let (kind, flags, rsize, dsize) = (u16_at(data, k), u16_at(data, k + 2), u32_at(data, k + 4) as usize, u32_at(data, k + 8) as usize);
            assert!(rsize >= 12 && rsize % 4 == 0 && dsize == rsize - 12 && k + rsize <= data.len(), "record {kind:#x}: size {rsize}, data {dsize}");
            let d = &data[k + 12..k + rsize];
            let first = n == 0 && k == 0;
            assert_eq!(kind == 0x4001, first, "the EMF+ header comes first, once");
            match kind {
                0x4001 => {
                    headers += 1;
                    assert_eq!((flags, rsize), (1, 28), "dual");
                    assert_eq!([0, 4, 8, 12].map(|i| u32_at(d, i)), [0xDBC0_1002, 1, 96, 96]);
                }
                0x401E | 0x401F | 0x4022 | 0x4021 | 0x4030 => {
                    assert_eq!(n, 0, "the set-up records are in the first comment");
                    let want = match kind {
                        0x401E => (5, 0),
                        0x401F => (4, 0),
                        0x4022 => (4, 0),
                        0x4021 => (7, 0),
                        _ => (2, 4),
                    };
                    assert_eq!((flags, dsize), want, "record {kind:#x}");
                    if kind == 0x4030 {
                        assert_eq!(f32_at(d, 0), 1.0);
                    }
                }
                0x4008 => {
                    let (id, ty) = (flags & 0xFF, (flags >> 8) & 0x7F);
                    assert!(id < 64 && flags & 0x8000 == 0, "object {flags:#x}");
                    assert_eq!(u32_at(d, 0), 0xDBC0_1002, "the object's version");
                    match ty {
                        3 => {
                            let count = u32_at(d, 4) as usize;
                            assert_eq!(u32_at(d, 8) & !0x2000, 0, "path flags");
                            assert_eq!(dsize, (12 + 9 * count).next_multiple_of(4), "a path of {count} points");
                            let types = &d[12 + 8 * count..12 + 9 * count];
                            let mut beziers = 0;
                            for (i, t) in types.iter().enumerate() {
                                assert!(matches!(t & 0x7F, 0 | 1 | 3) && t & 0x70 == 0, "point type {t:#x}");
                                assert!(i > 0 || t & 0x7F == 0, "a path starts with a start point");
                                if t & 0x7F == 0 {
                                    assert_eq!(beziers % 3, 0, "Bézier points in threes");
                                }
                                beziers = if t & 0x7F == 3 { beziers + 1 } else { 0 };
                            }
                            assert_eq!(beziers % 3, 0);
                        }
                        2 => {
                            assert_eq!(u32_at(d, 4), 0, "a pen's type");
                            let flags = u32_at(d, 8);
                            assert_eq!(flags & !0x1FE, 0, "pen flags {flags:#x}");
                            assert_eq!(u32_at(d, 12), 0, "UnitWorld");
                            assert!(f32_at(d, 16) > 0.0);
                            let mut j = 20;
                            for bit in [0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80] {
                                if flags & bit != 0 {
                                    j += 4;
                                }
                            }
                            if flags & 0x100 != 0 {
                                let n = u32_at(d, j) as usize;
                                assert!(n > 0 && (0..n).all(|i| f32_at(d, j + 4 + 4 * i) > 0.0), "dashes");
                                j += 4 + 4 * n;
                            }
                            assert_eq!((u32_at(d, j), u32_at(d, j + 4), d.len()), (0xDBC0_1002, 0, j + 12), "a solid brush ends the pen");
                        }
                        6 => {
                            assert!(f32_at(d, 4) > 0.0);
                            assert_eq!((u32_at(d, 8), u32_at(d, 12) & !3, u32_at(d, 16)), (2, 0, 0), "UnitPixel, bold and italic only, reserved");
                            assert_eq!(dsize, (24 + 2 * u32_at(d, 20) as usize).next_multiple_of(4));
                        }
                        _ => panic!("object type {ty}"),
                    }
                    objects[usize::from(id)] = Some((ty, d.to_vec()));
                }
                0x4014 | 0x4015 => {
                    let path = objects[usize::from(flags & 0xFF)].clone().filter(|o| o.0 == 3).expect("a path defined before it is used");
                    let p = &path.1;
                    let count = u32_at(p, 4) as usize;
                    let points = (0..count).map(|i| (f64::from(f32_at(p, 12 + 8 * i)) * 15.0, f64::from(f32_at(p, 16 + 8 * i)) * 15.0, p[12 + 8 * count + i])).collect();
                    if kind == 0x4014 {
                        assert!(flags & 0x8000 != 0 && dsize == 4, "the fill's colour inline");
                        let (rgb, winding) = (u32_at(d, 0) & 0xFF_FFFF, u32_at(p, 8) & 0x2000 != 0);
                        assert_eq!(u32_at(d, 0) >> 24, 255, "opaque");
                        // A shape's fill in more than one path (fill_groups) is one fill, as in GDI.
                        match out.last_mut() {
                            Some(Op::Fill { points: all, rgb: c, winding: w }) if fill_in == Some(n) && (*c, *w) == (rgb, winding) => all.extend(points),
                            _ => out.push(Op::Fill { points, rgb, winding }),
                        }
                        fill_in = Some(n);
                    } else {
                        assert_eq!((flags & 0xFF00, dsize), (0, 4));
                        let pen = objects[u32_at(d, 0) as usize].clone().filter(|o| o.0 == 2).expect("a pen defined before it is used").1;
                        let colour = u32_at(&pen, pen.len() - 4);
                        assert_eq!(colour >> 24, 255);
                        fill_in = None;
                        out.push(Op::Stroke { points, rgb: colour & 0xFF_FFFF, width: f64::from(f32_at(&pen, 16)) * 15.0 });
                    }
                }
                0x4036 => {
                    assert!(flags & 0x8000 != 0, "the text's colour inline");
                    let font = objects[usize::from(flags & 0xFF)].clone().filter(|o| o.0 == 6).expect("a font defined before it is used").1;
                    let n = u32_at(d, 12) as usize;
                    assert!(n % 2 == 0 && n > 0, "an even number of characters");
                    assert_eq!((u32_at(d, 4), u32_at(d, 8), dsize), (1, 0, 16 + 10 * n), "CmapLookup, no matrix");
                    let face: Vec<u16> = (0..u32_at(&font, 20) as usize).map(|i| u16_at(&font, 24 + 2 * i)).collect();
                    let chars = (0..n).map(|i| u16_at(d, 16 + 2 * i)).collect();
                    let at = (0..n).map(|i| (f64::from(f32_at(d, 16 + 2 * n + 8 * i)) * 15.0, f64::from(f32_at(d, 20 + 2 * n + 8 * i)) * 15.0)).collect();
                    let style = u32_at(&font, 12);
                    fill_in = None;
                    out.push(Op::Text { face: String::from_utf16(&face).unwrap(), height: f64::from(f32_at(&font, 4)) * 15.0, bold: style & 1 != 0, italic: style & 2 != 0, rgb: u32_at(d, 0) & 0xFF_FFFF, chars, at, end: 0.0 });
                }
                0x4004 => {
                    assert_eq!((flags, dsize), (0, 0));
                    fill_in = None;
                    out.push(Op::Picture);
                }
                0x4002 => {
                    assert_eq!((flags, dsize, n), (0, 0, comments.len() - 1));
                    assert!(std::ptr::eq(*r, &all[all.len() - 2]), "the end comes just before EMR_EOF");
                    ended = true;
                }
                _ => panic!("record {kind:#x}"),
            }
            k += rsize;
        }
    }
    assert!(headers == 1 && ended);
    out
}

// The two streams' calls are the same picture: the same calls in the same order, each EMF+ point within a logical
// unit of the GDI one (which is rounded to whole units), the same colours, pen widths within 1, and the same text in
// the same face and size with each character within 1 of where GDI puts it.
fn same_picture(name: &str, emf: &[u8]) {
    let (gdi, plus) = (gdi_ops(emf), plus_ops(emf));
    assert_eq!(gdi.len(), plus.len(), "{name}: {gdi:?}\n{plus:?}");
    let near = |a: f64, b: f64| (a - b).abs() <= 1.0;
    let points = |a: &[(f64, f64, u8)], b: &[(f64, f64, u8)]| {
        assert_eq!(a.len(), b.len(), "{name}: points");
        for (p, q) in a.iter().zip(b) {
            assert!(near(p.0, q.0) && near(p.1, q.1) && p.2 == q.2, "{name}: GDI {p:?}, EMF+ {q:?}");
        }
    };
    // A fill's figures: each EMF+ figure is one of GDI's, in any order (fill_groups puts them in more than one path).
    let figures = |a: &[(f64, f64, u8)], b: &[(f64, f64, u8)]| {
        let split = |p: &[(f64, f64, u8)]| -> Vec<std::ops::Range<usize>> {
            let starts: Vec<usize> = (0..p.len()).filter(|&i| p[i].2 & 0x7F == 0).chain([p.len()]).collect();
            starts.windows(2).map(|w| w[0]..w[1]).collect()
        };
        let (fa, fb) = (split(a), split(b));
        assert_eq!((fa.len(), a.len()), (fb.len(), b.len()), "{name}: figures and points");
        let mut by_start: std::collections::HashMap<(i64, i64), Vec<usize>> = std::collections::HashMap::new();
        for (i, f) in fa.iter().enumerate() {
            by_start.entry((a[f.start].0.round() as i64, a[f.start].1.round() as i64)).or_default().push(i);
        }
        let mut used = vec![false; fa.len()];
        for f in &fb {
            let (x, y) = (b[f.start].0.round() as i64, b[f.start].1.round() as i64);
            let same = |i: usize| !used[i] && fa[i].len() == f.len() && a[fa[i].clone()].iter().zip(&b[f.clone()]).all(|(p, q)| near(p.0, q.0) && near(p.1, q.1) && p.2 == q.2);
            let i = (-1..=1).flat_map(|dx| (-1..=1).map(move |dy| (x + dx, y + dy))).filter_map(|k| by_start.get(&k)).flatten().copied().find(|&i| same(i));
            used[i.unwrap_or_else(|| panic!("{name}: the EMF+ figure from {:?} is none of GDI's", b[f.start]))] = true;
        }
    };
    for (g, p) in gdi.iter().zip(&plus) {
        match (g, p) {
            (Op::Fill { points: a, rgb: c, winding: w }, Op::Fill { points: b, rgb: d, winding: v }) => {
                figures(a, b);
                assert_eq!((c, w), (d, v), "{name}: fill");
            }
            (Op::Stroke { points: a, rgb: c, width: w }, Op::Stroke { points: b, rgb: d, width: v }) => {
                points(a, b);
                assert_eq!(c, d, "{name}: pen colour");
                assert!(near(*w, v.max(1.0)), "{name}: GDI pen {w}, EMF+ {v}");
            }
            (Op::Text { face, height, bold, italic, rgb, chars, at, end }, Op::Text { face: f2, height: h2, bold: b2, italic: i2, rgb: c2, chars: ch2, at: at2, .. }) => {
                assert_eq!((face, bold, italic, rgb), (f2, b2, i2, c2), "{name}: font and colour");
                assert!(near(*height, *h2), "{name}: em {height} and {h2}");
                // A run of an odd number of characters has a space after it, at the end of its last advance.
                let extra = ch2.len() - chars.len();
                assert!(extra == chars.len() % 2 && ch2[..chars.len()] == chars[..] && (extra == 0 || ch2[chars.len()] == 0x20), "{name}: {chars:?} and {ch2:?}");
                for (a, b) in at.iter().zip(at2) {
                    assert!(near(a.0, b.0) && near(a.1, b.1), "{name}: GDI {a:?}, EMF+ {b:?}");
                }
                if extra == 1 {
                    assert!(near(*end, at2[chars.len()].0), "{name}: the space at {:?}, the advances end at {end}", at2[chars.len()]);
                }
            }
            (Op::Picture, Op::Picture) => {}
            _ => panic!("{name}: GDI {g:?}, EMF+ {p:?}"),
        }
    }
}

// The EMF with its EMF+ comments taken out, and the header's totals made right.
fn without_plus(emf: &[u8]) -> Vec<u8> {
    let mut out = emf[..HEADER].to_vec();
    let mut n = 1u32;
    for r in emf_records(emf).iter().skip(1).filter(|r| !is_plus(emf, r)) {
        out.extend_from_slice(&emf[r.1..r.1 + r.2]);
        n += 1;
    }
    let len = out.len() as u32;
    out[48..52].copy_from_slice(&len.to_le_bytes());
    out[52..56].copy_from_slice(&n.to_le_bytes());
    out
}

#[test]
fn plus_records_follow_ms_emfplus() {
    for (name, svg) in drawings().into_iter().chain(photo_drawings()) {
        let tree = crate::export::tree(&svg).unwrap();
        for cdxml in [None, Some(X)] {
            let emf = make_office_emf(&tree, cdxml);
            let ops = plus_ops(&emf);
            assert_eq!(ops.is_empty(), name == "an empty drawing", "{name}");
            // The EMF+ header is the second record, at 108; the CDXML comment after it.
            assert_eq!((u32_at(&emf, 108), u32_at(&emf, 120), u16_at(&emf, 124)), (70, EMF_PLUS, 0x4001), "{name}");
            assert_eq!(cdxml_from_emf(&emf).as_deref(), cdxml, "{name}: paste finds the CDXML past the EMF+ header");
            if cdxml.is_some() {
                assert_eq!(emf_records(&emf)[2].0, 70, "{name}: the CDXML comment is the third record");
            }
        }
    }
}

// The GDI records are make_emf's: without its EMF+ comments, the EMF is make_emf's to the byte. A picture's records
// also save the DC and set the mapping again first, and restore the DC after (they draw the same in GDI).
#[test]
fn without_its_plus_records_it_is_make_emf() {
    for (name, svg) in drawings() {
        let tree = crate::export::tree(&svg).unwrap();
        for cdxml in [None, Some(X)] {
            let (plain, office) = (make_emf(&tree, cdxml, None), make_office_emf(&tree, cdxml));
            assert!(without_plus(&office) == plain, "{name}: the GDI records changed");
            // The header: make_emf's but for the byte and record totals.
            assert_eq!((&office[..48], &office[56..HEADER]), (&plain[..48], &plain[56..HEADER]), "{name}");
        }
    }
    for (name, svg) in photo_drawings() {
        let tree = crate::export::tree(&svg).unwrap();
        let (plain, office) = (make_emf(&tree, Some(X), None), make_office_emf(&tree, Some(X)));
        let gdi = without_plus(&office);
        let kinds: Vec<u32> = emf_records(&gdi).iter().map(|r| r.0).collect();
        let k = kinds.iter().position(|&r| r == 33).expect("EMR_SAVEDC");
        assert_eq!(kinds[k..k + 11], [33, 17, 9, 10, 11, 12, 21, 35, 81, 36, 34], "{name}: the picture's records");
        // Without the save, the mapping and the restore, it is make_emf's.
        let records = emf_records(&gdi);
        let mut out = gdi[..HEADER].to_vec();
        for (i, r) in records.iter().enumerate().skip(1) {
            if !(k..k + 6).contains(&i) && i != k + 10 {
                out.extend_from_slice(&gdi[r.1..r.1 + r.2]);
            }
        }
        let n = (records.len() - 7) as u32;
        let len = out.len() as u32;
        out[48..52].copy_from_slice(&len.to_le_bytes());
        out[52..56].copy_from_slice(&n.to_le_bytes());
        assert!(out == plain, "{name}");
    }
}

#[test]
fn both_streams_draw_the_same_picture() {
    for (name, svg) in drawings().into_iter().chain(photo_drawings()) {
        same_picture(name, &make_office_emf(&crate::export::tree(&svg).unwrap(), Some(X)));
    }
}

// What each case draws in EMF+, by the stress list (S1, S2, S6, S8 to S12, S25).
#[test]
fn plus_draws_each_case() {
    let ops = |svg: &str| plus_ops(&make_office_emf(&crate::export::tree(svg).unwrap(), None));
    let all: Vec<(&str, Vec<Op>)> = drawings().into_iter().map(|(n, s)| (n, ops(&s))).collect();
    let of = |name: &str| &all.iter().find(|(n, _)| *n == name).unwrap().1;
    // S1: nothing drawn, and the header and end only.
    let empty = make_office_emf(&crate::export::tree(&drawings().into_iter().find(|d| d.0 == "an empty drawing").unwrap().1).unwrap(), None);
    let kinds: Vec<u32> = emf_records(&empty).iter().map(|r| r.0).collect();
    assert_eq!(kinds, [1, 70, 17, 9, 10, 11, 12, 18, 22, 70, 14]);
    // S2: one letter is two characters, the second a space.
    let Op::Text { chars, .. } = &of("one label of one letter")[0] else { panic!() };
    assert_eq!(chars, &[u16::from(b'O'), 0x20]);
    // S6: turned text and underlined text are outlines, as in the GDI records.
    for name in ["a structure turned 30 degrees and flipped, with labels", "underlined text"] {
        assert!(of(name).iter().all(|o| matches!(o, Op::Fill { .. })), "{name}");
    }
    // S8, S9: a nonzero path has the winding flag, an even-odd one does not.
    assert!(matches!(&of("overlapping fills in one nonzero path")[0], Op::Fill { winding: true, .. }));
    assert!(matches!(&of("an even-odd shape (an orbital's lobe)")[0], Op::Fill { winding: false, .. }));
    // S10: the hairline's pen is 0.1 pt; the 10 pt line's 10.
    let widths: Vec<f64> = of("a 0.1 pt hairline, a 10 pt line and a miter join").iter().filter_map(|o| if let Op::Stroke { width, .. } = o { Some(*width / UNIT as f64) } else { None }).collect();
    assert!((widths[0] - 0.1).abs() < 1e-3 && (widths[1] - 10.0).abs() < 1e-3, "{widths:?}");
    // S11: 40% yellow on white, opaque; bold red N, italic blue O.
    let colour = of("colour, part opacity, bold and italic");
    assert!(matches!(colour[0], Op::Fill { rgb: 0xFF_EE_99, .. }), "{:?}", colour[0]);
    assert!(colour.iter().any(|o| matches!(o, Op::Text { rgb: 0xCC_00_00, bold: true, italic: false, .. })));
    assert!(colour.iter().any(|o| matches!(o, Op::Text { rgb: 0x00_00_CC, bold: false, italic: true, .. })));
    // S25: a poster's points are floats, as far out as the GDI ones.
    let points = of("a poster 2 m wide").iter().find_map(|o| if let Op::Stroke { points, .. } = o { Some(points) } else { None }).unwrap();
    assert!((points[1].0 - 5659.0 * 20.0).abs() <= 1.0, "{points:?}");
}

// The review of issue 166: LibreOffice reads no fill mode and fills each EMF+ path even-odd. So for every shape, at
// points on a grid, the whole outline filled nonzero (GDI's fill, and Octet's) and its EMF+ paths filled nonzero
// (GDI+) cover the same points, and so do the paths filled even-odd, to under 1 in 200 points (specks where pieces of
// a cycle's arc overlap or cross). No two paths of a fill share an edge, where GDI+'s anti-aliasing would leave a light
// seam. On L-proline the bonds that meet at joins are one path and each line of the C=O double bond, which overlaps
// the next bond, a path of its own (in one path, 1.5% of its ink is white even-odd); letters keep their holes; the
// cycle starter's arc of 68 pieces is a few paths.
#[test]
fn plus_fills_draw_the_same_in_any_fill_mode() {
    // Each comment's nonzero fills (an even-odd one is even-odd in every reader): the points of each path's figures,
    // closed, with Béziers as 8 lines, in px.
    fn fills(emf: &[u8]) -> Vec<Vec<Vec<Vec<(f64, f64)>>>> {
        let mut out = Vec::new();
        for r in emf_records(emf).iter().filter(|r| is_plus(emf, r)) {
            let d = &emf[r.1 + 16..r.1 + r.2];
            let (mut k, mut path, mut paths) = (0, Vec::new(), Vec::new());
            while k < d.len() {
                let (kind, flags, size) = (u16_at(d, k), u16_at(d, k + 2), u32_at(d, k + 4) as usize);
                let o = &d[k + 12..k + size];
                if kind == 0x4008 && (flags >> 8) & 0x7F == 3 {
                    let n = u32_at(o, 4) as usize;
                    let (mut figures, mut j): (Vec<Vec<(f64, f64)>>, usize) = (Vec::new(), 0);
                    while j < n {
                        let at = |i: usize| (f64::from(f32_at(o, 12 + 8 * i)), f64::from(f32_at(o, 16 + 8 * i)));
                        match o[12 + 8 * n + j] & 0x7F {
                            0 => figures.push(vec![at(j)]),
                            1 => figures.last_mut().unwrap().push(at(j)),
                            _ => {
                                let f = figures.last_mut().unwrap();
                                let (p0, p1, p2, p3) = (*f.last().unwrap(), at(j), at(j + 1), at(j + 2));
                                for s in 1..=8 {
                                    let t = f64::from(s) / 8.0;
                                    let u = 1.0 - t;
                                    let c = [u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t];
                                    f.push((c[0] * p0.0 + c[1] * p1.0 + c[2] * p2.0 + c[3] * p3.0, c[0] * p0.1 + c[1] * p1.1 + c[2] * p2.1 + c[3] * p3.1));
                                }
                                j += 2;
                            }
                        }
                        j += 1;
                    }
                    path = if u32_at(o, 8) & 0x2000 != 0 { figures } else { Vec::new() };
                } else if kind == 0x4014 && !path.is_empty() {
                    paths.push(path.clone());
                }
                k += size;
            }
            if !paths.is_empty() {
                out.push(paths);
            }
        }
        out
    }
    // The winding number at (x, y), and whether a line from it crosses the figures' edges an odd number of times.
    fn wind(figures: &[Vec<(f64, f64)>], x: f64, y: f64) -> (i32, bool) {
        let (mut w, mut odd) = (0, false);
        for f in figures {
            for (i, a) in f.iter().enumerate() {
                let b = f[(i + 1) % f.len()];
                let cross = (b.0 - a.0) * (y - a.1) - (x - a.0) * (b.1 - a.1);
                if a.1 <= y && b.1 > y && cross > 0.0 {
                    w += 1;
                    odd = !odd;
                } else if b.1 <= y && a.1 > y && cross < 0.0 {
                    w -= 1;
                    odd = !odd;
                }
            }
        }
        (w, odd)
    }
    let page = |w: f32, h: f32, body: &str| format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}pt" height="{h}pt" viewBox="0 0 {w} {h}">{body}</svg>"##);
    // Whether figures a and b have edges on one line that overlap by 0.05 px or more.
    fn share_edge(a: &[(f64, f64)], b: &[(f64, f64)]) -> bool {
        let edges = |f: &[(f64, f64)]| (0..f.len()).map(|i| (f[i], f[(i + 1) % f.len()])).collect::<Vec<_>>();
        let eb = edges(b);
        edges(a).iter().any(|&(p, q)| {
            let l = ((q.0 - p.0).powi(2) + (q.1 - p.1).powi(2)).sqrt();
            l > 1e-6 && eb.iter().any(|&(r, s)| {
                let off = |t: (f64, f64)| ((q.0 - p.0) * (t.1 - p.1) - (q.1 - p.1) * (t.0 - p.0)) / l;
                let along = |t: (f64, f64)| ((t.0 - p.0) * (q.0 - p.0) + (t.1 - p.1) * (q.1 - p.1)) / l;
                off(r).abs() < 0.02 && off(s).abs() < 0.02 && along(r).max(along(s)).min(l) - along(r).min(along(s)).max(0.0) > 0.05
            })
        })
    }
    let mut cases = drawings();
    cases.push(("bonds, double bonds and hashed wedges that overlap at joins", octet_drawing(1, 24, 4, 8)));
    cases.push(("the structure starter", include_str!("../tests/pictures/starter-structure.svg").to_string()));
    cases.push(("the cycle starter", include_str!("../tests/pictures/starter-cycle.svg").to_string()));
    cases.push(("letters with holes, turned", page(120.0, 50.0, r#"<text x="10" y="35" font-family="Arial, Helvetica, sans-serif" font-size="24" transform="rotate(5 60 25)">B8%@&#xC5;</text>"#)));
    for (name, svg) in &cases {
        let emf = make_office_emf(&crate::export::tree(svg).unwrap(), None);
        for paths in fills(&emf) {
            let whole: Vec<Vec<(f64, f64)>> = paths.iter().flatten().cloned().collect();
            let points = whole.iter().flatten();
            let (x0, y0, x1, y1) = points.fold((f64::MAX, f64::MAX, f64::MIN, f64::MIN), |b, p| (b.0.min(p.0), b.1.min(p.1), b.2.max(p.0), b.3.max(p.1)));
            let step = ((x1 - x0) * (y1 - y0) / 250_000.0).sqrt().max(0.1);
            let (mut y, mut ink, mut other, mut odd) = (y0 + 0.37 * step, 0, 0, 0);
            while y < y1 {
                let mut x = x0 + 0.37 * step;
                while x < x1 {
                    let nonzero = wind(&whole, x, y).0 != 0;
                    let parts = paths.iter().any(|p| wind(p, x, y).0 != 0);
                    let even_odd = paths.iter().any(|p| wind(p, x, y).1);
                    ink += usize::from(nonzero);
                    other += usize::from(parts != nonzero);
                    odd += usize::from(even_odd != nonzero);
                    x += step;
                }
                y += step;
            }
            assert!(other * 200 < ink.max(1), "{name}: {other} of {ink} points of ink differ in GDI+ from the GDI record");
            assert!(odd * 200 < ink.max(1), "{name}: {odd} of {ink} points of ink differ when the paths are filled even-odd");
            for (i, a) in paths.iter().enumerate() {
                for b in &paths[i + 1..] {
                    assert!(!a.iter().any(|f| b.iter().any(|g| share_edge(f, g))), "{name}: two paths of a fill share an edge");
                }
            }
        }
    }
    let emf = make_office_emf(&crate::export::tree(include_str!("../tests/pictures/starter-cycle.svg")).unwrap(), None);
    let arc = fills(&emf).into_iter().find(|p| p.iter().map(Vec::len).sum::<usize>() > 60).expect("the cycle's arc");
    assert!(arc.len() <= 12, "the cycle's arc in {} paths", arc.len());
    // L-proline: its bonds' path, and the two lines of C=O.
    let emf = make_office_emf(&crate::export::tree(PROLINE).unwrap(), None);
    let counts: Vec<Vec<usize>> = fills(&emf).iter().map(|p| p.iter().map(Vec::len).collect()).collect();
    assert_eq!(counts[0], [7, 1, 1], "L-proline's paths of figures");
}

// The dashes in pen widths: round dashes as SVG gives them with round dash caps; square ones a width longer from half
// a width earlier; a zero dash at least 1/20 pt; and the offset.
#[test]
fn plus_pens_carry_caps_joins_and_dashes() {
    let svg = &drawings().into_iter().find(|d| d.0 == "square-capped dashes from an offset, and dots").unwrap().1;
    let emf = make_office_emf(&crate::export::tree(svg).unwrap(), None);
    let mut pens = Vec::new();
    for r in emf_records(&emf).iter().filter(|r| is_plus(&emf, r)) {
        let d = &emf[r.1 + 16..r.1 + r.2];
        let mut k = 0;
        while k < d.len() {
            if u16_at(d, k) == 0x4008 && (u16_at(d, k + 2) >> 8) & 0x7F == 2 {
                pens.push(d[k + 12..k + u32_at(d, k + 4) as usize].to_vec());
            }
            k += u32_at(d, k + 4) as usize;
        }
    }
    // To 6 places: the widths come through the SVG's transforms.
    let floats = |p: &[u8], from: usize, n: usize| (0..n).map(|i| (f64::from(f32_at(p, from + 4 * i)) * 1e6).round() / 1e6).collect::<Vec<_>>();
    // Square caps (1), miter clipped (3) with SVG's limit 4, custom dashes (5) with flat dash caps (0).
    let p = &pens[0];
    assert_eq!((u32_at(p, 8), u32_at(p, 20), u32_at(p, 24), u32_at(p, 28), floats(p, 32, 1)[0], u32_at(p, 36), u32_at(p, 40)), (0x1FE, 1, 1, 3, 4.0, 5, 0));
    // 2 pt wide: dashes of 4 and 3 pt are 2 and 1.5 widths; square, 3 and 0.5, from 0.5 + 0.5 widths.
    assert_eq!((floats(p, 44, 1)[0], u32_at(p, 48), floats(p, 52, 2)), (1.0, 2, vec![3.0, 0.5]));
    // Round caps and round dash caps; the zero dash is 1/20 pt, 0.025 widths.
    let p = &pens[1];
    assert_eq!((u32_at(p, 20), u32_at(p, 24), u32_at(p, 40), floats(p, 44, 1)[0]), (2, 2, 2, 0.0));
    assert_eq!(floats(p, 52, 2), [0.025, 2.0]);
    // Square caps with a gap of half a width: the gap would be gone, so it is the least.
    assert_eq!(floats(&pens[2], 52, 2), [2.0, 0.05]);
}

// The same drawing gives the same bytes (S18, S21), and the EMF+ records add at most twice the GDI EMF's size, and
// under 1 KB for a picture: its pixels go in once.
#[test]
fn plus_bytes_are_steady_and_small() {
    for (name, svg) in drawings().into_iter().chain(photo_drawings()) {
        let tree = crate::export::tree(&svg).unwrap();
        let (a, b) = (make_office_emf(&tree, Some(X)), make_office_emf(&crate::export::tree(&svg).unwrap(), Some(X)));
        assert!(a == b, "{name}: the bytes differ");
        let plain = make_emf(&tree, Some(X), None).len();
        assert!(a.len() <= 3 * plain, "{name}: {} bytes, the GDI EMF {plain}", a.len());
    }
    let tree = crate::export::tree(&picture_svg()).unwrap();
    assert!(make_office_emf(&tree, None).len() - make_emf(&tree, None, None).len() < 1024);
}

// S16, S17: paste reads the CDXML from the EMF+ EMF, and a hostile EMF+ comment (one that claims more bytes than the
// file holds, or a record larger than its comment) gives nothing and does not panic.
#[test]
fn paste_reads_the_plus_emf_and_refuses_a_hostile_one() {
    let emf = make_office_emf(&crate::export::tree(PROLINE).unwrap(), Some(X));
    assert_eq!(crate::export::cdxml_from_picture(&emf).as_deref(), Some(X));
    // The EMF+ comment says it is larger than the file: nothing is read.
    let mut long = emf.clone();
    long[112..116].copy_from_slice(&u32::MAX.to_le_bytes());
    assert_eq!(cdxml_from_emf(&long), None);
    // An EMF+ record in it that claims more than its comment: the EMF reader walks EMF records only, so the CDXML
    // comment after it is still found.
    let mut inner = emf.clone();
    inner[128..132].copy_from_slice(&0x7FFF_FFF0u32.to_le_bytes());
    assert_eq!(cdxml_from_emf(&inner).as_deref(), Some(X));
    // Cut short anywhere: no panic.
    for cut in (0..emf.len()).step_by(7) {
        let _ = cdxml_from_emf(&emf[..cut]);
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Windows: GDI and GDI+ draw the EMFs (issue 166's proof, decision 0023). Each draws into a 32-bit DIB section on
// white through a memory DC, as Word draws into a window's or a printer's DC: GDI with PlayEnhMetaFile, GDI+ with
// GdipCreateFromHDC and GdipDrawImageRectI.

#[cfg(windows)]
mod windows {
    use super::*;
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteEnhMetaFile, DeleteObject, GdiFlush, PatBlt, PlayEnhMetaFile, SelectObject, SetEnhMetaFileBits, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, RGBQUAD, WHITENESS,
    };
    use windows_sys::Win32::Graphics::GdiPlus::{
        GdipCreateBitmapFromScan0, GdipCreateFromHDC, GdipCreateMetafileFromEmf, GdipDeleteGraphics, GdipDisposeImage, GdipDrawImageRectI, GdipGetImageGraphicsContext, GdipGraphicsClear,
        GdipBitmapGetPixel, GdiplusStartup, GdiplusStartupInput, GpBitmap, GpGraphics, GpImage, GpMetafile,
    };

    // A picture drawn by GDI or GDI+: w by h px, each pixel's red, green and blue.
    pub(super) struct Drawn {
        pub w: i32,
        pub h: i32,
        pub rgb: Vec<[u8; 3]>,
    }
    impl Drawn {
        pub fn at(&self, x: i32, y: i32) -> [u8; 3] {
            self.rgb[(y * self.w + x) as usize]
        }
        // The box of pixels darker than `level` in any channel (inclusive), or None.
        pub fn ink(&self, level: u8) -> Option<[i32; 4]> {
            let mut b: Option<[i32; 4]> = None;
            for y in 0..self.h {
                for x in 0..self.w {
                    if self.at(x, y).iter().any(|c| *c < level) {
                        b = Some(b.map_or([x, y, x, y], |b| [b[0].min(x), b[1].min(y), b[2].max(x), b[3].max(y)]));
                    }
                }
            }
            b
        }
    }

    // GDI+ is started once for every test in this process; GdiplusShutdown is not called (the process ends).
    fn gdiplus() {
        static ON: std::sync::Once = std::sync::Once::new();
        ON.call_once(|| {
            let mut token: usize = 0;
            let input = GdiplusStartupInput { GdiplusVersion: 1, DebugEventCallback: 0, SuppressBackgroundThread: 0, SuppressExternalCodecs: 0 };
            // SAFETY: GdiplusStartup with a live input; the token is kept for the life of the process.
            assert_eq!(unsafe { GdiplusStartup(&mut token, &input, std::ptr::null_mut()) }, 0, "GDI+ starts");
        });
    }

    // `emf` drawn into w by h px on white: by GDI, or by GDI+ through the DC.
    pub(super) fn draw(emf: &[u8], w: i32, h: i32, plus: bool) -> Drawn {
        render(emf, w, h, plus).unwrap_or_else(|e| panic!("{e}"))
    }
    // As draw, with the step that failed as an error.
    pub(super) fn render(emf: &[u8], w: i32, h: i32, plus: bool) -> Result<Drawn, String> {
        gdiplus();
        let header = BITMAPINFOHEADER { biSize: 40, biWidth: w, biHeight: -h, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB, biSizeImage: 0, biXPelsPerMeter: 0, biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0 };
        let info = BITMAPINFO { bmiHeader: header, bmiColors: [RGBQUAD { rgbBlue: 0, rgbGreen: 0, rgbRed: 0, rgbReserved: 0 }] };
        let rect = RECT { left: 0, top: 0, right: w, bottom: h };
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        // SAFETY: every handle is checked before it is used and freed before the function returns. `bits` is the DIB
        // section's own memory, w * h * 4 bytes, read while the bitmap is alive and after GdiFlush. The EMF's pointer
        // and length are one slice's. GDI+ owns the metafile's handle once GdipCreateMetafileFromEmf has it.
        unsafe {
            let dc = CreateCompatibleDC(std::ptr::null_mut());
            assert!(!dc.is_null(), "a memory DC");
            let bitmap = CreateDIBSection(dc, &info, DIB_RGB_COLORS, &mut bits, std::ptr::null_mut(), 0);
            assert!(!bitmap.is_null() && !bits.is_null(), "a DIB section");
            let old = SelectObject(dc, bitmap);
            assert_ne!(PatBlt(dc, 0, 0, w, h, WHITENESS), 0);
            let handle = SetEnhMetaFileBits(emf.len() as u32, emf.as_ptr());
            let drawn = if handle.is_null() {
                Err("GDI does not take the EMF".to_string())
            } else if plus {
                let mut graphics: *mut GpGraphics = std::ptr::null_mut();
                let mut metafile: *mut GpMetafile = std::ptr::null_mut();
                let made = GdipCreateFromHDC(dc, &mut graphics);
                let taken = GdipCreateMetafileFromEmf(handle, 1, &mut metafile);
                let status = if made == 0 && taken == 0 { GdipDrawImageRectI(graphics, metafile as *mut GpImage, 0, 0, w, h) } else { -1 };
                if taken == 0 {
                    GdipDisposeImage(metafile as *mut GpImage);
                } else {
                    DeleteEnhMetaFile(handle);
                }
                if made == 0 {
                    GdipDeleteGraphics(graphics);
                }
                if status == 0 { Ok(()) } else { Err(format!("GDI+ does not draw the EMF: on the DC {made}, the metafile {taken}, drawing {status}")) }
            } else {
                let played = PlayEnhMetaFile(dc, handle, &rect);
                DeleteEnhMetaFile(handle);
                if played != 0 { Ok(()) } else { Err("GDI does not play every record of the EMF".to_string()) }
            };
            GdiFlush();
            let raw = std::slice::from_raw_parts(bits as *const u8, (w * h * 4) as usize);
            let rgb = raw.chunks_exact(4).map(|p| [p[2], p[1], p[0]]).collect();
            SelectObject(dc, old);
            DeleteObject(bitmap);
            DeleteDC(dc);
            drawn.map(|_| Drawn { w, h, rgb })
        }
    }

    // `emf` drawn by GDI+ into a GDI+ bitmap (32 bits a pixel, no alpha) rather than a DC.
    pub(super) fn draw_on_bitmap(emf: &[u8], w: i32, h: i32) -> Result<Drawn, String> {
        gdiplus();
        let mut rgb = Vec::with_capacity((w * h) as usize);
        // SAFETY: each call's status is checked before its result is used, and each object is freed before the
        // function returns. GDI+ owns the metafile's handle once GdipCreateMetafileFromEmf has it.
        unsafe {
            let handle = SetEnhMetaFileBits(emf.len() as u32, emf.as_ptr());
            if handle.is_null() {
                return Err("GDI does not take the EMF".into());
            }
            let mut metafile: *mut GpMetafile = std::ptr::null_mut();
            if GdipCreateMetafileFromEmf(handle, 1, &mut metafile) != 0 {
                DeleteEnhMetaFile(handle);
                return Err("GDI+ does not take the EMF".into());
            }
            let mut bitmap: *mut GpBitmap = std::ptr::null_mut();
            let mut graphics: *mut GpGraphics = std::ptr::null_mut();
            let mut status = GdipCreateBitmapFromScan0(w, h, 0, 0x0002_2009, std::ptr::null_mut(), &mut bitmap); // PixelFormat32bppRGB
            if status == 0 {
                status = GdipGetImageGraphicsContext(bitmap as *mut GpImage, &mut graphics);
                if status == 0 {
                    status = GdipGraphicsClear(graphics, 0xFFFF_FFFF);
                    if status == 0 {
                        status = GdipDrawImageRectI(graphics, metafile as *mut GpImage, 0, 0, w, h);
                    }
                    GdipDeleteGraphics(graphics);
                }
                for y in 0..h {
                    for x in 0..w {
                        let mut argb = 0u32;
                        if status == 0 {
                            status = GdipBitmapGetPixel(bitmap, x, y, &mut argb);
                        }
                        rgb.push([(argb >> 16) as u8, (argb >> 8) as u8, argb as u8]);
                    }
                }
                GdipDisposeImage(bitmap as *mut GpImage);
            }
            GdipDisposeImage(metafile as *mut GpImage);
            if status != 0 {
                return Err(format!("GDI+ status {status} on a GDI+ bitmap"));
            }
        }
        Ok(Drawn { w, h, rgb })
    }

    // The picture's size at `k` px a pt.
    pub(super) fn px(tree: &usvg::Tree, k: f32) -> (i32, i32) {
        let (w, h) = size(tree);
        ((w * k).ceil() as i32, (h * k).ceil() as i32)
    }

    // On a picture of ink `ink` on white: of the pixels at an edge of the ink (not white, with a white or a lighter
    // neighbour, or partly covered), how many are partly covered (between ink and white by more than 16 levels).
    pub(super) fn smoothing(d: &Drawn, ink: [u8; 3], within: [i32; 4]) -> (usize, usize) {
        let grey = |c: [u8; 3]| c.iter().zip(ink).all(|(a, b)| a.abs_diff(b) > 16) && c.iter().any(|a| *a < 239);
        let white = |c: [u8; 3]| c.iter().all(|a| *a >= 239);
        let (mut edge, mut partial) = (0, 0);
        for y in within[1].max(1)..within[3].min(d.h - 1) {
            for x in within[0].max(1)..within[2].min(d.w - 1) {
                let c = d.at(x, y);
                if white(c) {
                    continue;
                }
                let next = [d.at(x - 1, y), d.at(x + 1, y), d.at(x, y - 1), d.at(x, y + 1)];
                if grey(c) || next.iter().any(|n| white(*n)) {
                    edge += 1;
                    partial += usize::from(grey(c));
                }
            }
        }
        (edge, partial)
    }
}

// T1 (issue 166's cause and fix): GDI+ draws a diagonal bond of the GDI-only EMF with no partly covered pixel, and
// the Office object's EMF with at least 30% of the bond's edge pixels partly covered (anti-aliased). At 4 px a pt.
#[cfg(windows)]
#[test]
fn ole_plus_is_smooth() {
    use windows::*;
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="80pt" height="40pt" viewBox="0 0 80 40"><path d="M5 5L75 33L74.2 35L4.2 7Z" fill="#000"/></svg>"##;
    let tree = crate::export::tree(svg).unwrap();
    let (w, h) = px(&tree, 4.0);
    let all = [0, 0, w, h];
    let plain = smoothing(&draw(&make_emf(&tree, None, None), w, h, true), [0; 3], all);
    let office = smoothing(&draw(&make_office_emf(&tree, None), w, h, true), [0; 3], all);
    let bitmap = draw_on_bitmap(&make_office_emf(&tree, None), w, h).map(|d| smoothing(&d, [0; 3], all));
    eprintln!("A diagonal bond through GDI+: the GDI-only EMF has {} of {} edge pixels partly covered; the Office object's EMF {} of {} on a DC, and on a GDI+ bitmap (partly covered, of the edge's) {bitmap:?}.", plain.1, plain.0, office.1, office.0);
    assert!(office.0 > 100 && office.1 * 10 >= office.0 * 3, "the Office object's EMF is not anti-aliased: {office:?}");
    assert_eq!(plain.1, 0, "GDI+ anti-aliased the GDI-only EMF: issue 166's cause in decision 0023 is wrong");
}

// T2, T3: GDI+'s ink box for the Office object's EMF is GDI's for make_emf's to within 2 px, and GDI plays the Office
// object's EMF to make_emf's pixels (the fallback is 1.1.2's picture). At 4 px a pt.
#[cfg(windows)]
#[test]
fn ole_plus_ink_box_and_gdi_pixels() {
    use windows::*;
    for (name, svg) in drawings().into_iter().chain(photo_drawings()).filter(|d| d.0 != "a poster 2 m wide") {
        let tree = crate::export::tree(&svg).unwrap();
        let (w, h) = px(&tree, 4.0);
        let (plain, office) = (make_emf(&tree, Some(X), None), make_office_emf(&tree, Some(X)));
        let gdi = draw(&plain, w, h, false);
        assert!(draw(&office, w, h, false).rgb == gdi.rgb, "{name}: GDI draws the Office object's EMF differently from make_emf's");
        let plus = draw(&office, w, h, true);
        match (gdi.ink(200), plus.ink(200)) {
            (None, None) => assert_eq!(name, "an empty drawing"),
            (Some(a), Some(b)) => assert!(a.iter().zip(b).all(|(p, q)| (p - q).abs() <= 2), "{name}: GDI's ink box {a:?}, GDI+'s {b:?}"),
            (a, b) => panic!("{name}: GDI's ink box {a:?}, GDI+'s {b:?}"),
        }
    }
}

// T4: a picture goes through EmfPlusGetDC: GDI+ draws its red pixels in GDI's box, to within 1 px, upright and turned
// 30 degrees. On a GDI+ bitmap too (printed).
#[cfg(windows)]
#[test]
fn ole_plus_photo() {
    use windows::*;
    let red = |d: &Drawn| {
        let mut b: Option<[i32; 4]> = None;
        for y in 0..d.h {
            for x in 0..d.w {
                let c = d.at(x, y);
                if c[0] > 200 && c[1] < 80 && c[2] < 80 {
                    b = Some(b.map_or([x, y, x, y], |b| [b[0].min(x), b[1].min(y), b[2].max(x), b[3].max(y)]));
                }
            }
        }
        b
    };
    for (name, svg) in photo_drawings() {
        let tree = crate::export::tree(&svg).unwrap();
        let (w, h) = px(&tree, 4.0);
        let office = make_office_emf(&tree, Some(X));
        let gdi = red(&draw(&make_emf(&tree, Some(X), None), w, h, false)).expect("GDI draws the picture");
        let bitmap = draw_on_bitmap(&office, w, h).map(|d| red(&d));
        eprintln!("{name}: GDI's red box {gdi:?}; GDI+ on a GDI+ bitmap {bitmap:?}");
        let plus = red(&draw(&office, w, h, true)).unwrap_or_else(|| panic!("{name}: GDI+ drew no picture"));
        assert!(gdi.iter().zip(plus).all(|(a, b)| (a - b).abs() <= 1), "{name}: GDI's red box {gdi:?}, GDI+'s {plus:?}");
    }
}

// T5: the fill mode. Two squares wound the same way, overlapping, in one path (they share the point (20, 35), so
// fill_groups keeps them together). With the winding flag (a nonzero fill) GDI+ fills their overlap; even-odd, it
// leaves it white.
#[cfg(windows)]
#[test]
fn ole_plus_fill_mode() {
    use windows::*;
    for (rule, filled) in [("nonzero", true), ("evenodd", false)] {
        let svg = format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="60pt" height="60pt" viewBox="0 0 60 60"><path d="M5 5h30v30h-15h-15z M20 20h30v30h-30v-15z" fill="#000" fill-rule="{rule}"/></svg>"##);
        let tree = crate::export::tree(&svg).unwrap();
        let (w, h) = px(&tree, 4.0);
        let emf = make_office_emf(&tree, None);
        assert_eq!(emf_records(&emf).iter().filter(|r| is_plus(&emf, r) && u16_at(&emf, r.1 + 16) == 0x4008).count(), 1, "{rule}: one path");
        // The overlap's middle is (27.5, 27.5) pt; a part of a square alone is (10, 10) pt.
        let (plus, gdi) = (draw(&emf, w, h, true), draw(&emf, w, h, false));
        for d in [&plus, &gdi] {
            assert_eq!(d.at(40, 40), [0; 3], "{rule}: a square");
        }
        assert_eq!(gdi.at(110, 110) == [0; 3], filled, "{rule}: GDI's overlap");
        assert_eq!(plus.at(110, 110) == [0; 3], filled, "{rule}: GDI+'s overlap (PathPointFlags 0x2000 is the winding fill)");
    }
}

// T6: a path of 30,000 points (a 500-residue peptide's bonds, which meet at mitred joins, are one path of about
// 25,000) in one EmfPlusObject record of 270 KB, as the writer makes it: GDI+ draws it as GDI does.
#[cfg(windows)]
fn large_path() -> (usvg::Tree, Vec<u8>) {
    // 7,500 squares of 3 pt as a chessboard, each square's corners shared with the next ones', so fill_groups keeps
    // them in one path: 30,000 points.
    let mut d = String::new();
    for j in 0..100 {
        for i in (j % 2..150).step_by(2) {
            d += &format!("M{} {}h3v3h-3z", 5 + 3 * i, 5 + 3 * j);
        }
    }
    let svg = format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="460pt" height="310pt" viewBox="0 0 460 310"><path d="{d}" fill="#000"/></svg>"##);
    let tree = crate::export::tree(&svg).unwrap();
    let emf = make_office_emf(&tree, None);
    (tree, emf)
}
// Whether GDI+ draws `emf` as GDI draws `gdi_emf`: as much ink, to a tenth, in the same box, to 2 px. At 2 px a pt.
#[cfg(windows)]
fn draws_as_gdi(tree: &usvg::Tree, gdi_emf: &[u8], emf: &[u8]) -> Result<(), String> {
    use windows::*;
    let (w, h) = px(tree, 2.0);
    let (gdi, plus) = (draw(gdi_emf, w, h, false), render(emf, w, h, true)?);
    let ink = |d: &Drawn| d.rgb.iter().filter(|c| c[0] < 128).count();
    let (a, b) = (ink(&gdi), ink(&plus));
    let boxes = (gdi.ink(128), plus.ink(128));
    let same = matches!(boxes, (Some(p), Some(q)) if p.iter().zip(q).all(|(x, y)| (x - y).abs() <= 2));
    if b * 10 >= a * 9 && b * 10 <= a * 11 && same { Ok(()) } else { Err(format!("ink {b} px against GDI's {a}, boxes {boxes:?}")) }
}
#[cfg(windows)]
#[test]
fn ole_plus_large_path() {
    let (tree, emf) = large_path();
    let records = emf_records(&emf);
    let big = records.iter().copied().filter(|r| is_plus(&emf, r)).max_by_key(|r| r.2).unwrap();
    let object = u32_at(&emf, big.1 + 20) as usize;
    assert!(object > 230_000 && u16_at(&emf, big.1 + 16) == 0x4008, "one path object of {object} bytes");
    if let Err(e) = draws_as_gdi(&tree, &emf, &emf) {
        panic!("GDI+ does not draw a path object of {object} bytes in one record: {e}");
    }
}

// The same path continued over records of 32,000 bytes, each part in a comment of its own, two ways: TotalObjectSize
// in every part (C set on all but the last), and only in the parts with C set. It prints which GDI+ draws, for the
// fallback if one record fails. It asserts nothing, and it runs alone (ignored here; a CI step of its own that may
// fail), as a part GDI+ misreads could end the process.
#[cfg(windows)]
#[test]
#[ignore]
fn ole_plus_large_path_continued() {
    let (tree, emf) = large_path();
    let records = emf_records(&emf);
    let big = records.iter().copied().filter(|r| is_plus(&emf, r)).max_by_key(|r| r.2).unwrap();
    let data = &emf[big.1 + 16..big.1 + big.2];
    let object = u32_at(data, 4) as usize;
    let (head, rest) = (&data[..object], &data[object..]);
    let body = &head[12..];
    let continued = |every: bool| {
        let parts: Vec<&[u8]> = body.chunks(32_000).collect();
        let mut out = emf[..big.1].to_vec();
        for (i, part) in parts.iter().enumerate() {
            let last = i + 1 == parts.len();
            let total = !last || every;
            let flags = u16_at(head, 2) | if last { 0 } else { 0x8000 };
            let mut rec = Vec::new();
            let size = 12 + if total { 4 } else { 0 } + part.len().next_multiple_of(4);
            rec.extend(0x4008u16.to_le_bytes());
            rec.extend(flags.to_le_bytes());
            rec.extend((size as u32).to_le_bytes());
            rec.extend((size as u32 - 12).to_le_bytes());
            if total {
                rec.extend((body.len() as u32).to_le_bytes());
            }
            rec.extend(*part);
            rec.resize(size, 0);
            if last {
                rec.extend(rest);
            }
            out.extend(70u32.to_le_bytes());
            out.extend((16 + rec.len() as u32).to_le_bytes());
            out.extend((4 + rec.len() as u32).to_le_bytes());
            out.extend(EMF_PLUS.to_le_bytes());
            out.extend(rec);
        }
        out.extend_from_slice(&emf[big.1 + big.2..]);
        let (len, n) = (out.len() as u32, records.len() as u32 + parts.len() as u32 - 1);
        out[48..52].copy_from_slice(&len.to_le_bytes());
        out[52..56].copy_from_slice(&n.to_le_bytes());
        out
    };
    for (way, every) in [("TotalObjectSize in every part", true), ("TotalObjectSize only in the parts with C set", false)] {
        eprintln!("A path of 30,000 points continued, {way}: {:?}", draws_as_gdi(&tree, &emf, &continued(every)));
    }
}

// T8: labels. GDI+'s dark pixels for each label are inside that label's GDI text box (its EXTTEXTOUTW bounds), and
// the middle of its ink is within 1.5 px of GDI's. At 4 px a pt.
#[cfg(windows)]
#[test]
fn ole_plus_labels() {
    use windows::*;
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="160pt" height="60pt" viewBox="0 0 160 60"><g font-family="Arial, Helvetica, sans-serif" font-size="10" fill="rgb(15, 23, 42)"><text x="10" y="20">OH</text><text x="60" y="20">NH<tspan dy="2" font-size="7.5">2</tspan></text><text x="110" y="20" font-weight="bold">Cl</text><text x="10" y="50">CO<tspan dy="2" font-size="7.5">2</tspan>Me</text><text x="110" y="50" font-style="italic">t</text></g></svg>"##;
    let tree = crate::export::tree(svg).unwrap();
    let (w, h) = px(&tree, 4.0);
    let emf = make_office_emf(&tree, None);
    let (gdi, plus) = (draw(&make_emf(&tree, None, None), w, h, false), draw(&emf, w, h, true));
    // Each run's box, from 96 dpi device px to 4 px a pt (times 3), a pixel larger each way.
    let boxes: Vec<[i32; 4]> = emf_records(&emf).iter().filter(|r| r.0 == 84).map(|r| [8, 12, 16, 20].map(|k| i32_at(&emf, r.1 + k) * 3)).map(|b| [b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3]).collect();
    assert!(boxes.len() >= 5, "{boxes:?}");
    let dark = |c: [u8; 3]| c.iter().any(|v| *v < 160);
    for y in 0..h {
        for x in 0..w {
            if dark(plus.at(x, y)) {
                assert!(boxes.iter().any(|b| x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]), "GDI+ ink at ({x}, {y}) is outside every label");
            }
        }
    }
    // The middle of each label's ink (the five labels are far apart: a box 40 pt across round each start).
    let middle = |d: &Drawn, b: [i32; 4]| {
        let (mut sx, mut sy, mut n) = (0.0, 0.0, 0.0);
        for y in b[1].max(0)..=b[3].min(d.h - 1) {
            for x in b[0].max(0)..=b[2].min(d.w - 1) {
                let c = d.at(x, y);
                let k = 255.0 - f64::from(c[0].min(c[1]).min(c[2]));
                (sx, sy, n) = (sx + k * f64::from(x), sy + k * f64::from(y), n + k);
            }
        }
        (sx / n, sy / n)
    };
    for (x, y) in [(10, 20), (60, 20), (110, 20), (10, 50), (110, 50)] {
        let b = [x * 4 - 8, y * 4 - 48, x * 4 + 160, y * 4 + 24];
        let (a, p) = (middle(&gdi, b), middle(&plus, b));
        assert!((a.0 - p.0).hypot(a.1 - p.1) <= 1.5, "the label at ({x}, {y}) pt: GDI's ink is centred at {a:?}, GDI+'s at {p:?}");
    }
}

// T9: zoom. GDI+ draws L-proline at 0.25, 1, 4 and 40 px a pt with no error, anti-aliased at each, and its ink box
// scales with the zoom (to within 2 px of the box at 4 px a pt, scaled).
#[cfg(windows)]
#[test]
fn ole_plus_zoom() {
    use windows::*;
    let tree = crate::export::tree(PROLINE).unwrap();
    let emf = make_office_emf(&tree, Some(X));
    let (w4, h4) = px(&tree, 4.0);
    let base = draw(&emf, w4, h4, true).ink(200).expect("ink at 4 px a pt");
    for k in [0.25f32, 1.0, 4.0, 40.0] {
        let (w, h) = px(&tree, k);
        let d = draw(&emf, w, h, true);
        let ink = d.ink(250).unwrap_or_else(|| panic!("no ink at {k} px a pt"));
        let (edge, partial) = smoothing(&d, [15, 23, 42], [0, 0, w, h]);
        assert!(partial > 0 && partial * 10 >= edge, "at {k} px a pt: {partial} of {edge} edge pixels partly covered");
        if k >= 1.0 {
            let want = base.map(|v| f64::from(v) * f64::from(k) / 4.0);
            let ink = d.ink(200).unwrap();
            let slack = 2.0 + f64::from(k) / 4.0;
            assert!(ink.iter().zip(want).all(|(a, b)| (f64::from(*a) - b).abs() <= slack), "at {k} px a pt the ink box is {ink:?}, {want:?} scaled");
        }
        let _ = ink;
    }
}

// Stress cases (issue 166's stress list and more; src/wordpaste-stress.check.ts lists them).
#[path = "wordpaste_stress_tests.rs"]
mod stress;
