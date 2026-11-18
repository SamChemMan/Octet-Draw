// Window > Cascade, Tile Top to Bottom and Tile Side by Side (issue 73), as ChemDraw for Windows has Cascade, Tile
// Horizontal and Tile Vertical. On Windows, and on Linux under X11. The Mac's own Window menu tiles and cascades
// windows (Move & Resize, Arrange in Front), and under Wayland an app cannot place its windows. The drawings the
// Window menu lists go on the monitor of the window in front, inside its work area, never smaller than Octet's
// smallest window. Minimised, full-screen and hidden windows, and windows on another virtual desktop, stay as they are.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum How {
    Cascade,
    TileTopBottom,
    TileSideBySide,
}

// The Window menu's items, in the order of ChemDraw's toolbar. No ids start with window_ (a drawing in the Window
// menu) or arrange_ (Object > Align).
pub const ITEMS: [(&str, &str); 3] = [("cascade", "Cascade"), ("tile_top_bottom", "Tile Top to Bottom"), ("tile_side_by_side", "Tile Side by Side")];

// Whether Octet places windows here: on Windows, and on Linux under X11 (x11, at start).
static PLACES: AtomicBool = AtomicBool::new(cfg!(windows));
pub fn places_windows() -> bool {
    PLACES.load(Ordering::Relaxed)
}

// Linux: whether the display is X11, once at start on the main thread (before the menu is made), as the eyedropper
// reads it.
#[cfg(target_os = "linux")]
pub fn x11() {
    use gtk::gdk::prelude::*;
    PLACES.store(gtk::gdk::Display::default().is_some_and(|d| d.type_().name() == "GdkX11Display"), Ordering::Relaxed);
}

// Octet's smallest window: its inner size in logical pixels (windows.rs, REL-29).
const MIN: (f64, f64) = (800.0, 620.0);
// The smallest cascade step in logical pixels: a new window's offset (windows.rs open).
const STEP: f64 = 28.0;

// A rectangle in a monitor's physical pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Rect {
    pub x: i64,
    pub y: i64,
    pub w: i64,
    pub h: i64,
}

// A window's frame in its own physical pixels, at its own scale: what its outer rectangle adds to its inner one on
// each side (title bar, borders, menu bar), and how much of that does not show (Windows' resize borders). Left, top,
// right, bottom.
#[derive(Clone, Copy, Debug, Default)]
pub struct Frame {
    pub scale: f64,
    pub outer: [i64; 4],
    pub hidden: [i64; 4],
}

// Where a window goes: its outer top left and its inner size, in the target monitor's physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Place {
    pub x: i64,
    pub y: i64,
    pub w: i64,
    pub h: i64,
}

// A scale the system gave, or 1 if it makes no sense.
fn sane(scale: f64) -> f64 {
    if scale.is_finite() && scale > 0.0 {
        scale.min(16.0)
    } else {
        1.0
    }
}

// A window's frame on the target monitor: the width and height its visible frame adds, the hidden part at its left
// and top, its smallest visible size, and the visible frame above the page (title bar, and on Windows the menu bar).
struct Fit {
    chrome: (i64, i64),
    hidden: (i64, i64),
    min: (i64, i64),
    top: i64,
}
fn fit(f: &Frame, scale: f64) -> Fit {
    let k = scale / sane(f.scale);
    let px = |v: i64| (v.clamp(0, 100_000) as f64 * k).round() as i64;
    let outer = f.outer.map(px);
    let hidden: [i64; 4] = std::array::from_fn(|i| px(f.hidden[i]).min(outer[i]));
    let chrome = (outer[0] + outer[2] - hidden[0] - hidden[2], outer[1] + outer[3] - hidden[1] - hidden[3]);
    let inner = ((MIN.0 * scale).ceil() as i64, (MIN.1 * scale).ceil() as i64);
    Fit { chrome, hidden: (hidden[0], hidden[1]), min: (inner.0 + chrome.0, inner.1 + chrome.1), top: outer[1] - hidden[1] }
}
// The window for a visible frame at (x, y), w by h.
fn place(f: &Fit, x: i64, y: i64, w: i64, h: i64) -> Place {
    Place { x: x - f.hidden.0, y: y - f.hidden.1, w: w - f.chrome.0, h: h - f.chrome.1 }
}

// One axis of a tile: slot j of count equal slots over span from start, for a window at least len long. A window
// longer than its slot keeps its length, and the windows overlap evenly: the first at the start, the last at the end.
// A window longer than the span sits at its start. Gives where the window starts and its length.
fn axis(start: i64, span: i64, count: i64, j: i64, len: i64) -> (i64, i64) {
    let (a, b) = (start + span * j / count, start + span * (j + 1) / count);
    if b - a >= len {
        (a, b - a)
    } else if count > 1 && span >= len {
        (start + (span - len) * j / (count - 1), len)
    } else {
        (start, len)
    }
}

// The tiles: for n windows, r = floor(sqrt n) lines across and c = floor(n / r) lines along, and the last n - r c
// lines take one window more. The count in each line, in order.
fn lines(n: usize) -> Vec<usize> {
    if n == 0 {
        return vec![];
    }
    let r = (1..=n).take_while(|r| r * r <= n).last().unwrap_or(1);
    let c = n / r;
    (0..c).map(|j| r + usize::from(j >= c - (n - r * c))).collect()
}

// Where each window goes in the work area (physical pixels, at the monitor's scale), in the order they are raised:
// the last on top. front: the window in front. It takes the first tile (top left) and the last cascade place (on top).
// The others follow in the order given.
pub fn places(how: How, area: Rect, scale: f64, frames: &[Frame], front: Option<usize>) -> Vec<(usize, Place)> {
    let scale = sane(scale);
    let n = frames.len();
    let fits: Vec<Fit> = frames.iter().map(|f| fit(f, scale)).collect();
    let front = front.filter(|&i| i < n);
    let others = (0..n).filter(|&i| Some(i) != front);
    if how == How::Cascade {
        let order: Vec<usize> = others.chain(front).collect();
        // The step: the tallest title bar, at least a new window's offset. A run of m windows keeps each window at least
        // half the work area and at least the smallest window; after m windows the next run starts at the top left.
        let d = fits.iter().map(|f| f.top).max().unwrap_or(0).max((STEP * scale).ceil() as i64).max(1);
        let most = |i: usize| fits.iter().map(|f| [f.min.0, f.min.1][i]).max().unwrap_or(0);
        let room = |span: i64, min: i64| span - min.max((span + 1) / 2);
        let m = (1 + room(area.w, most(0)).min(room(area.h, most(1))).max(0) / d).min(n as i64).max(1);
        let (w, h) = (area.w - (m - 1) * d, area.h - (m - 1) * d);
        return order
            .iter()
            .enumerate()
            .map(|(k, &i)| {
                let (f, s) = (&fits[i], k as i64 % m);
                (i, place(f, area.x + s * d, area.y + s * d, w.max(f.min.0), h.max(f.min.1)))
            })
            .collect();
    }
    // Tiles, filled line by line: columns for Side by Side, rows for Top to Bottom. The first tile is raised last.
    let order: Vec<usize> = front.into_iter().chain(others).collect();
    let all = lines(n);
    let mut out = Vec::with_capacity(n);
    let mut k = 0;
    for (j, &count) in all.iter().enumerate() {
        for i in 0..count {
            let f = &fits[order[k]];
            let (across, along) = (all.len() as i64, count as i64);
            let ((x, w), (y, h)) = if how == How::TileSideBySide {
                (axis(area.x, area.w, across, j as i64, f.min.0), axis(area.y, area.h, along, i as i64, f.min.1))
            } else {
                (axis(area.x, area.w, along, i as i64, f.min.0), axis(area.y, area.h, across, j as i64, f.min.1))
            };
            out.push((order[k], place(f, x, y, w, h)));
            k += 1;
        }
    }
    out.reverse();
    out
}

// One arrangement at a time: one asked for while one runs waits, and a newer one takes its place.
#[derive(Default)]
struct Queue {
    running: bool,
    next: Option<How>,
}
impl Queue {
    // Whether how runs now (else it waits).
    fn ask(&mut self, how: How) -> bool {
        if self.running {
            self.next = Some(how);
            return false;
        }
        self.running = true;
        true
    }
    // The one that waits, to run next.
    fn done(&mut self) -> Option<How> {
        let next = self.next.take();
        self.running = next.is_some();
        next
    }
}
static QUEUE: Mutex<Queue> = Mutex::new(Queue { running: false, next: None });

// Whether this Octet arranges windows: where the Window menu has the items, and on the Mac in a debug build only (to
// check the code on a Mac). A Mac release build refuses.
fn allowed(places: bool, mac: bool, debug: bool) -> bool {
    places || (mac && debug)
}

// A fault while the windows move leaves nothing held: menu commands follow the focus again, and the next request runs.
struct Release;
impl Drop for Release {
    fn drop(&mut self) {
        crate::windows::hold(None);
        if std::thread::panicking() {
            *QUEUE.lock().unwrap_or_else(|e| e.into_inner()) = Queue::default();
        }
    }
}

// The page's Cascade and Tile commands. Only how comes from the page; any other value is refused. With no window, it
// returns at once.
#[tauri::command]
pub async fn arrange_windows(app: AppHandle, how: How) -> Result<(), String> {
    if crate::windows::HEADLESS.load(Ordering::Relaxed) {
        return Ok(());
    }
    if !allowed(places_windows(), cfg!(target_os = "macos"), cfg!(debug_assertions)) {
        return Err("Octet does not arrange windows on this system.".into());
    }
    if !QUEUE.lock().unwrap().ask(how) {
        return Ok(());
    }
    let mut how = how;
    loop {
        arrange(&app, how);
        match QUEUE.lock().unwrap().done() {
            Some(next) => how = next,
            None => return Ok(()),
        }
    }
}

// The windows arranged: the drawings the Window menu lists, in its order, and only Octet's own windows.
fn chosen(listed: Vec<String>) -> Vec<String> {
    listed.into_iter().filter(|l| crate::windows::ours(l)).collect()
}

fn arrange(app: &AppHandle, how: How) {
    let front = crate::windows::front(app);
    let windows: Vec<WebviewWindow> = chosen(crate::windows::listed(app)).iter().filter_map(|l| app.get_webview_window(l)).filter(shown).collect();
    if windows.is_empty() {
        return;
    }
    // The front window's monitor, else the first window's, else the primary monitor.
    let lead = front.as_deref().and_then(|l| app.get_webview_window(l)).filter(|w| !w.is_minimized().unwrap_or(true));
    let monitor = lead
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| windows[0].current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let (at, size) = (monitor.work_area().position, monitor.work_area().size);
    let area = Rect { x: at.x.into(), y: at.y.into(), w: size.width.into(), h: size.height.into() };
    // While the windows move, the one in front stays the one menu commands and AI apps go to.
    crate::windows::hold(front.clone());
    let release = Release;
    for w in windows.iter().filter(|w| w.is_maximized().unwrap_or(false)) {
        let _ = w.unmaximize();
    }
    let frames: Vec<Frame> = windows.iter().map(frame).collect();
    let list = places(how, area, monitor.scale_factor(), &frames, windows.iter().position(|w| Some(w.label()) == front.as_deref()));
    // Moved, sized (once, and only if the size changes), then moved again: a window that moves to a monitor at
    // another scale is sized again by the system on the way.
    for &(i, p) in &list {
        let w = &windows[i];
        let to = PhysicalPosition::new(p.x.clamp(i32::MIN.into(), i32::MAX.into()) as i32, p.y.clamp(i32::MIN.into(), i32::MAX.into()) as i32);
        let size = PhysicalSize::new(p.w.clamp(1, u32::MAX.into()) as u32, p.h.clamp(1, u32::MAX.into()) as u32);
        let _ = w.set_position(to);
        if w.inner_size().ok() != Some(size) {
            let _ = w.set_size(size);
            let _ = w.set_position(to);
        }
    }
    let stack: Vec<WebviewWindow> = list.iter().map(|&(i, _)| windows[i].clone()).collect();
    raise(app, &stack);
    drop(release);
    // The top window has the focus: the one that was in front, or the first drawing when Home was in front.
    if let Some(top) = stack.last() {
        let _ = top.set_focus();
    }
}

// A window that is arranged: shown, not minimised, not full screen, and on this virtual desktop.
fn shown(w: &WebviewWindow) -> bool {
    w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(true) && !w.is_fullscreen().unwrap_or(true) && !cloaked(w)
}

fn frame(w: &WebviewWindow) -> Frame {
    let (Ok(scale), Ok(op), Ok(os), Ok(ip), Ok(is)) = (w.scale_factor(), w.outer_position(), w.outer_size(), w.inner_position(), w.inner_size()) else {
        return Frame::default();
    };
    let (ox, oy, ow, oh) = (i64::from(op.x), i64::from(op.y), i64::from(os.width), i64::from(os.height));
    let (ix, iy, iw, ih) = (i64::from(ip.x), i64::from(ip.y), i64::from(is.width), i64::from(is.height));
    Frame { scale, outer: [ix - ox, iy - oy, ox + ow - ix - iw, oy + oh - iy - ih], hidden: hidden(w) }
}

// Windows 10 and 11 draw a window's resize borders invisibly: the parts of its rectangle outside what DWM shows.
#[cfg(windows)]
fn hidden(w: &WebviewWindow) -> [i64; 4] {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;
    let Ok(hwnd) = w.hwnd() else { return [0; 4] };
    let (mut outer, mut seen) = (RECT::default(), RECT::default());
    // SAFETY: each call writes one RECT into a local of that size, for this window's own handle.
    let ok = unsafe {
        GetWindowRect(hwnd.0 as _, &mut outer) != 0
            && DwmGetWindowAttribute(hwnd.0 as _, DWMWA_EXTENDED_FRAME_BOUNDS as u32, (&raw mut seen).cast(), size_of::<RECT>() as u32) >= 0
    };
    if !ok {
        return [0; 4];
    }
    [seen.left - outer.left, seen.top - outer.top, outer.right - seen.right, outer.bottom - seen.bottom].map(|v| i64::from(v.max(0)))
}
#[cfg(not(windows))]
fn hidden(_: &WebviewWindow) -> [i64; 4] {
    [0; 4]
}

// Windows: a window on another virtual desktop is cloaked.
#[cfg(windows)]
fn cloaked(w: &WebviewWindow) -> bool {
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    let Ok(hwnd) = w.hwnd() else { return false };
    let mut c = 0u32;
    // SAFETY: the call writes one u32 into a local of that size.
    unsafe { DwmGetWindowAttribute(hwnd.0 as _, DWMWA_CLOAKED as u32, (&raw mut c).cast(), size_of::<u32>() as u32) >= 0 && c != 0 }
}
#[cfg(not(windows))]
fn cloaked(_: &WebviewWindow) -> bool {
    false
}

// Each window to the top in turn, without making it the active window, on the main thread. The Mac (debug builds
// only) keeps its order.
#[cfg(windows)]
fn raise(app: &AppHandle, stack: &[WebviewWindow]) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE};
    let handles: Vec<isize> = stack.iter().filter_map(|w| w.hwnd().ok()).map(|h| h.0 as isize).collect();
    let _ = app.run_on_main_thread(move || {
        for h in handles {
            // SAFETY: an Octet window's own handle; the call neither moves nor sizes it.
            unsafe { SetWindowPos(h as _, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE) };
        }
    });
}
#[cfg(target_os = "linux")]
fn raise(app: &AppHandle, stack: &[WebviewWindow]) {
    let stack = stack.to_vec();
    let _ = app.run_on_main_thread(move || {
        use gtk::prelude::WidgetExt;
        for g in stack.iter().filter_map(|w| w.gtk_window().ok()?.window()) {
            g.raise();
        }
    });
}
#[cfg(target_os = "macos")]
fn raise(_: &AppHandle, _: &[WebviewWindow]) {}

#[cfg(test)]
mod tests {
    use super::*;

    const NONE: Frame = Frame { scale: 1.0, outer: [0; 4], hidden: [0; 4] };
    // Windows 11 at 100%: 8 px resize borders on the left, right and bottom (hidden but 1 px), a 31 px title bar and
    // a 20 px menu bar.
    const WIN: Frame = Frame { scale: 1.0, outer: [8, 59, 8, 8], hidden: [7, 0, 7, 7] };

    fn visible(p: &Place, f: &Frame, scale: f64) -> Rect {
        let f = fit(f, scale);
        Rect { x: p.x + f.hidden.0, y: p.y + f.hidden.1, w: p.w + f.chrome.0, h: p.h + f.chrome.1 }
    }
    fn inside(r: Rect, a: Rect) -> bool {
        r.x >= a.x && r.y >= a.y && r.x + r.w <= a.x + a.w && r.y + r.h <= a.y + a.h
    }
    fn overlap(a: Rect, b: Rect) -> bool {
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    }
    fn min_inner(scale: f64) -> (i64, i64) {
        ((800.0 * scale).ceil() as i64, (620.0 * scale).ceil() as i64)
    }

    #[test]
    fn no_window_no_place() {
        for how in [How::Cascade, How::TileTopBottom, How::TileSideBySide] {
            assert!(places(how, Rect { x: 0, y: 0, w: 1920, h: 1040 }, 1.0, &[], None).is_empty());
        }
    }

    // Stress case 2: one window fills the work area (tiles) or sits at its top left the work area's size (cascade).
    #[test]
    fn one_window() {
        let area = Rect { x: 0, y: 0, w: 1920, h: 1040 };
        for how in [How::Cascade, How::TileTopBottom, How::TileSideBySide] {
            let p = places(how, area, 1.0, &[WIN], Some(0));
            assert_eq!(p.len(), 1);
            assert_eq!(visible(&p[0].1, &WIN, 1.0), area, "{how:?}");
        }
    }

    // Stress case 4: the grid's lines, and every count from 1 to 40.
    #[test]
    fn the_grid() {
        assert_eq!(lines(1), [1]);
        assert_eq!(lines(2), [1, 1]);
        assert_eq!(lines(3), [1, 1, 1]);
        assert_eq!(lines(4), [2, 2]);
        assert_eq!(lines(5), [2, 3]);
        assert_eq!(lines(7), [2, 2, 3]);
        assert_eq!(lines(11), [3, 4, 4]);
        assert_eq!(lines(40), [6, 6, 7, 7, 7, 7]);
        for n in 1..=40 {
            let l = lines(n);
            assert_eq!(l.iter().sum::<usize>(), n);
            assert!(l.windows(2).all(|p| p[0] <= p[1] && p[1] - p[0] <= 1), "{n}: {l:?}");
            assert!(l.iter().all(|&c| c >= 1));
        }
    }

    // On a huge work area every tile is larger than the smallest window: the tiles never overlap, cover the work area
    // with no gap, and end on its edges, for 1 to 40 windows (cases 4 and 11).
    #[test]
    fn tiles_cover_the_work_area() {
        let area = Rect { x: -2560, y: -1440, w: 100_000, h: 100_000 };
        for how in [How::TileTopBottom, How::TileSideBySide] {
            for n in 1..=40 {
                let frames = vec![WIN; n];
                let p = places(how, area, 1.0, &frames, Some(n / 2));
                assert_eq!(p.len(), n);
                let tiles: Vec<Rect> = p.iter().map(|(i, p)| visible(p, &frames[*i], 1.0)).collect();
                assert_eq!(tiles.iter().map(|t| t.w * t.h).sum::<i64>(), area.w * area.h, "{how:?} {n}");
                for (a, t) in tiles.iter().enumerate() {
                    assert!(inside(*t, area));
                    assert!(tiles[a + 1..].iter().all(|u| !overlap(*t, *u)), "{how:?} {n}");
                }
                assert!(tiles.iter().any(|t| t.x + t.w == area.x + area.w) && tiles.iter().any(|t| t.y + t.h == area.y + area.h));
                let mut seen: Vec<usize> = p.iter().map(|(i, _)| *i).collect();
                seen.sort();
                assert_eq!(seen, (0..n).collect::<Vec<_>>(), "each window once");
            }
        }
    }

    // Every count, every mode, on common work areas and odd ones: every frame inside the work area when the smallest
    // window fits, else at its top left at the smallest size; never smaller than the smallest window (cases 3, 8, 11).
    #[test]
    fn every_count_fits() {
        let areas = [
            (Rect { x: 0, y: 0, w: 1280, h: 720 }, 1.0),
            (Rect { x: 0, y: 40, w: 1920, h: 1040 }, 1.25),
            (Rect { x: 0, y: 0, w: 2560, h: 1400 }, 2.0),
            (Rect { x: 1920, y: 0, w: 3840, h: 2100 }, 1.5),
            (Rect { x: 0, y: 0, w: 1024, h: 600 }, 1.25),
            (Rect { x: 0, y: 0, w: 700, h: 500 }, 1.0),
            (Rect { x: -1920, y: 0, w: 1920, h: 1040 }, 1.0),
            (Rect { x: -2560, y: -1440, w: 2560, h: 1400 }, 1.0),
        ];
        for (area, scale) in areas {
            for how in [How::Cascade, How::TileTopBottom, How::TileSideBySide] {
                for n in 1..=40 {
                    let frames: Vec<Frame> = (0..n).map(|k| if k % 2 == 0 { WIN } else { Frame { scale: 2.0, outer: [16, 118, 16, 16], hidden: [14, 0, 14, 14] } }).collect();
                    let p = places(how, area, scale, &frames, Some(0));
                    assert_eq!(p.len(), n);
                    let min = min_inner(scale);
                    for (i, pl) in &p {
                        assert!(pl.w >= min.0 && pl.h >= min.1, "{how:?} {n} {area:?}: {pl:?}");
                        let v = visible(pl, &frames[*i], scale);
                        let f = fit(&frames[*i], scale);
                        if f.min.0 <= area.w && f.min.1 <= area.h {
                            assert!(inside(v, area), "{how:?} {n} {area:?} at {scale}: {v:?}");
                        } else {
                            assert!(v.x >= area.x && v.y >= area.y, "{how:?} {n}");
                            assert!(f.min.0 <= area.w || (v.x == area.x && pl.w == min.0));
                            assert!(f.min.1 <= area.h || (v.y == area.y && pl.h == min.1));
                        }
                    }
                }
            }
        }
    }

    // Stress case 3: two windows on 1920 x 1080 at 100% (taskbar 40 px). Side by Side: two 960 px columns, full height,
    // frames touching. Top to Bottom: full width, each the smallest height, overlapping evenly.
    #[test]
    fn two_windows_at_100() {
        let area = Rect { x: 0, y: 0, w: 1920, h: 1040 };
        let p = places(How::TileSideBySide, area, 1.0, &[WIN, WIN], Some(1));
        let v: Vec<Rect> = p.iter().map(|(i, p)| visible(p, &[WIN, WIN][*i], 1.0)).collect();
        assert_eq!(p.last().unwrap().0, 1, "the front window is raised last");
        assert_eq!(v[1], Rect { x: 0, y: 0, w: 960, h: 1040 }, "the front window takes the first tile");
        assert_eq!(v[0], Rect { x: 960, y: 0, w: 960, h: 1040 });
        // The hidden borders go outside the tile, so the visible frames touch.
        assert_eq!(p[1].1, Place { x: -7, y: 0, w: 960 - 2, h: 1040 - 59 - 1 });
        let p = places(How::TileTopBottom, area, 1.0, &[WIN, WIN], Some(0));
        let v: Vec<Rect> = p.iter().map(|(i, p)| visible(p, &[WIN, WIN][*i], 1.0)).collect();
        let tall = 620 + 59 + 1;
        assert_eq!(v[1], Rect { x: 0, y: 0, w: 1920, h: tall });
        assert_eq!(v[0], Rect { x: 0, y: 1040 - tall, w: 1920, h: tall });
    }

    // Stress case 3: two windows side by side at 125% and 150% on 1080p are each the smallest width, the first at the
    // left edge and the last at the right edge.
    #[test]
    fn two_windows_scaled() {
        for scale in [1.25, 1.5] {
            let area = Rect { x: 0, y: 0, w: 1920, h: (1080.0 - 48.0 * scale) as i64 };
            let frames = [Frame { scale, outer: [0, 40, 0, 0], hidden: [0; 4] }; 2];
            let p = places(How::TileSideBySide, area, scale, &frames, Some(0));
            let w = (800.0 * scale).ceil() as i64;
            assert_eq!((p[1].1.x, p[1].1.w), (0, w));
            assert_eq!((p[0].1.x, p[0].1.w), (1920 - w, w));
        }
    }

    // Stress case 4 at the smallest size: 40 windows side by side on 1080p overlap evenly in 6 columns.
    #[test]
    fn forty_windows() {
        let area = Rect { x: 0, y: 0, w: 1920, h: 1040 };
        let p = places(How::TileSideBySide, area, 1.0, &vec![NONE; 40], Some(0));
        let mut xs: Vec<i64> = p.iter().map(|(_, p)| p.x).collect();
        xs.sort();
        xs.dedup();
        assert_eq!(xs, [0, 224, 448, 672, 896, 1120]);
        assert!(p.iter().all(|(_, p)| p.w == 800 && p.h == 620 && p.x + p.w <= 1920 && p.y + p.h <= 1040));
    }

    // Stress case 4, the cascade: equal steps of at least 28 logical pixels and the title bar, runs that start again at
    // the top left, every window the same size, at least half the work area and the smallest window, the front one on
    // top.
    #[test]
    fn the_cascade() {
        for (area, scale, frame) in [
            (Rect { x: 0, y: 0, w: 1920, h: 1040 }, 1.0, WIN),
            (Rect { x: -1920, y: 25, w: 2560, h: 1415 }, 2.0, Frame { scale: 2.0, outer: [0, 56, 0, 0], hidden: [0; 4] }),
            (Rect { x: 0, y: 0, w: 3840, h: 2100 }, 1.5, NONE),
        ] {
            for n in [1, 2, 3, 5, 12, 40] {
                let frames = vec![frame; n];
                let p = places(How::Cascade, area, scale, &frames, Some(n - 1));
                assert_eq!(p.last().unwrap().0, n - 1, "the front window is on top");
                let v: Vec<Rect> = p.iter().map(|(i, p)| visible(p, &frames[*i], scale)).collect();
                assert!(v.iter().all(|r| (r.w, r.h) == (v[0].w, v[0].h) && inside(*r, area)));
                assert!(v[0].w * 2 >= area.w && v[0].h * 2 >= area.h);
                assert!(p.iter().all(|(_, p)| p.w >= min_inner(scale).0 && p.h >= min_inner(scale).1));
                assert_eq!((v[0].x, v[0].y), (area.x, area.y), "the first at the top left");
                if n > 1 {
                    let d = v[1].x - v[0].x;
                    assert!(d >= (28.0 * scale).ceil() as i64 && d >= fit(&frame, scale).top, "{n} at {scale}: {d}");
                    for k in 1..n {
                        let back = v[k].x == area.x;
                        assert!(back || (v[k].x - v[k - 1].x, v[k].y - v[k - 1].y) == (d, d), "{n}: {k}");
                        assert!(!back || v[k].y == area.y);
                    }
                }
            }
        }
        // 1080p at 100% with Windows' frame (title bar and menu bar, 59 px): a run of 7, then the next starts at the top
        // left.
        let p = places(How::Cascade, Rect { x: 0, y: 0, w: 1920, h: 1040 }, 1.0, &[WIN; 12], None);
        let xs: Vec<i64> = p.iter().map(|(_, p)| p.x + 7).collect();
        assert_eq!(xs, [0, 59, 118, 177, 236, 295, 354, 0, 59, 118, 177, 236]);
    }

    // R6 and stress case 6, the order: the front window first in the tiles (raised last) and last in the cascade; the
    // rest in the order given.
    #[test]
    fn the_order() {
        let area = Rect { x: 0, y: 0, w: 4000, h: 3000 };
        let tiles: Vec<usize> = places(How::TileSideBySide, area, 1.0, &[NONE; 4], Some(2)).iter().map(|p| p.0).collect();
        assert_eq!(tiles, [3, 1, 0, 2]);
        let cascade: Vec<usize> = places(How::Cascade, area, 1.0, &[NONE; 4], Some(2)).iter().map(|p| p.0).collect();
        assert_eq!(cascade, [0, 1, 3, 2]);
        // Home in front, holding no drawing: the drawings in the menu's order.
        assert_eq!(places(How::TileSideBySide, area, 1.0, &[NONE; 3], None).iter().map(|p| p.0).collect::<Vec<_>>(), [2, 1, 0]);
        assert_eq!(places(How::Cascade, area, 1.0, &[NONE; 3], Some(7)).iter().map(|p| p.0).collect::<Vec<_>>(), [0, 1, 2]);
    }

    // Stress case 8: a window measured at 150% goes to a monitor at 100%, and one at 100% to a monitor at 200%: its frame
    // scales, and its inner size is the tile less the scaled frame, never under the smallest window.
    #[test]
    fn mixed_scales() {
        let at150 = Frame { scale: 1.5, outer: [12, 89, 12, 12], hidden: [11, 0, 11, 11] };
        let p = places(How::TileSideBySide, Rect { x: -1920, y: 0, w: 1920, h: 1040 }, 1.0, &[WIN, at150, WIN], Some(0));
        let (_, q) = p.iter().find(|(i, _)| *i == 1).unwrap();
        assert_eq!(fit(&at150, 1.0).chrome, (2, 60));
        assert!(q.w >= 800 && q.h == 1040 - 60 && q.x >= -1920 - 7);
        let p = places(How::TileTopBottom, Rect { x: 0, y: 0, w: 5120, h: 2800 }, 2.0, &[WIN, WIN], Some(0));
        assert!(p.iter().all(|(_, p)| p.w == 5120 - 4 && p.h >= 1240));
        assert_eq!(fit(&WIN, 2.0).chrome, (4, 120));
    }

    // Stress case 11 and bad input: huge areas, no scale or a scale that makes no sense, hostile frames: no panic, no
    // overflow.
    #[test]
    fn no_overflow() {
        let huge = Rect { x: i32::MIN.into(), y: i32::MIN.into(), w: u32::MAX.into(), h: u32::MAX.into() };
        let wild = Frame { scale: f64::NAN, outer: [i64::MAX, -5, i64::MIN, 3], hidden: [i64::MAX; 4] };
        for scale in [0.0, f64::NAN, f64::INFINITY, -1.0, 1e300, 1.0] {
            for how in [How::Cascade, How::TileTopBottom, How::TileSideBySide] {
                for area in [huge, Rect::default(), Rect { x: 0, y: 0, w: -50, h: 3 }] {
                    let p = places(how, area, scale, &[wild, NONE, WIN], Some(9));
                    assert_eq!(p.len(), 3);
                    assert!(p.iter().all(|(_, p)| p.w > 0 && p.h > 0));
                }
            }
        }
    }

    // Stress case 12: one at a time. A request while one runs waits; a newer one takes its place; it runs once.
    #[test]
    fn one_at_a_time() {
        let mut q = Queue::default();
        assert!(q.ask(How::Cascade));
        assert!(!q.ask(How::TileSideBySide));
        assert!(!q.ask(How::TileTopBottom));
        assert_eq!(q.done(), Some(How::TileTopBottom), "the last one asked for runs");
        assert!(!q.ask(How::Cascade), "still running");
        assert_eq!(q.done(), Some(How::Cascade));
        assert_eq!(q.done(), None);
        assert!(q.ask(How::TileSideBySide), "idle again: runs at once");
        assert_eq!(q.done(), None);
    }

    // Stress case 15: the page gives only one of three names; anything else is refused.
    #[test]
    fn only_three_names() {
        let how = |v: serde_json::Value| serde_json::from_value::<How>(v).ok();
        assert_eq!(how(serde_json::json!("cascade")), Some(How::Cascade));
        assert_eq!(how(serde_json::json!("tile_top_bottom")), Some(How::TileTopBottom));
        assert_eq!(how(serde_json::json!("tile_side_by_side")), Some(How::TileSideBySide));
        for bad in [serde_json::json!("explode"), serde_json::json!(5), serde_json::json!(null), serde_json::json!({"x": 1}), serde_json::json!("Cascade")] {
            assert_eq!(how(bad), None);
        }
    }

    // Stress case 7: only the drawings the Window menu lists, in its order. A window that is not Octet's own (Reaxys)
    // is never arranged.
    #[test]
    fn only_the_drawings() {
        let l = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(chosen(l(&["draw-3", "main", "reaxys", "object-1", "draw-1"])), l(&["draw-3", "main", "object-1", "draw-1"]));
        assert!(chosen(l(&[])).is_empty());
    }

    // Stress case 19: Windows and Linux under X11 arrange windows; the Mac only in a debug build; Wayland never.
    #[test]
    fn where_it_runs() {
        assert!(allowed(true, false, false), "Windows, Linux under X11");
        assert!(!allowed(false, false, true), "Linux under Wayland");
        assert!(!allowed(false, true, false), "a Mac release build refuses");
        assert!(allowed(false, true, true), "a Mac debug build, to check the code");
    }

    // R10: the ids are the commands' names, and none looks like a drawing in the Window menu or an Align command.
    #[test]
    fn the_ids() {
        for (id, _) in ITEMS {
            assert!(!id.starts_with("window_") && !id.starts_with("arrange_"), "{id}");
            assert!(serde_json::from_value::<How>(serde_json::json!(id)).is_ok(), "{id}");
        }
    }
}
