# 0020: A window for each drawing

Status: built 2 November 2026, as Sam asked. Cascade and Tile built 18 November 2026 (issue 73).

Octet had one window. Home covered the drawing, and opening a drawing replaced the one that was open. Sam asked for
more than one drawing open at a time, each in a window of its own, with Home listing the open windows.

## What others do

- ChemDraw 26.1 has a window for each document. New Document and Open Document open a new window. On Windows its
  toolbar has Cascade, Tile Horizontal and Tile Vertical (`~/octet-research/notes/chemdraw26-inventory.md`).
- Mac document apps (TextEdit, Pages) open a file into an untouched empty Untitled window instead of a new one.
- ChemDraw 22.2 starts in a document window; files opened later open in windows of their own.

## Decision

- Home is the window `main`. Each drawing has a window `draw-1`, `draw-2` and on (`src-tauri/src/windows.rs`).
- The first drawing opens in Home's window, as Octet's one window did (Sam, 3 November 2026). Once a drawing is open,
  what opens from Home or from a drawing window opens in a new window. A window that holds an untouched new drawing
  takes the next one instead, and so does Home's window when no drawing window is open. Opening several files at once
  puts the first in that window and each of the others in a window of its own.
- Home has an Open windows section first, with each window's name, picture and state (Edited, Saved, New). A click
  brings the window to the front. A drawing that is open already comes to the front instead of opening twice.
- File > Home in a drawing window brings Home to the front, and opens it again if it was closed. When Home's window
  holds a drawing, Home shows over it, as File > Home does in that window.
- Menu commands go to the window in front. Each window sends its ticks, colours and fonts when it comes to the front;
  the menu bar is built again only when a list changes. The Window menu lists the open drawings, with a tick on the
  one in front: on the Mac the system lists the windows, and on Windows and Linux Octet lists the drawings that Home
  lists (issue 73).
- Quit asks about each window with unsaved changes in turn; Cancel stops it. The Dock's Quit and a logout do the same.
- Recovery keeps a copy for each window (`<session>z<window>`). Settings are shared through storage events.
- Files from Finder open one window each. A file dropped on a drawing goes into that drawing.

## Cascade and Tile (issue 73, release 1.1.3)

Plan: `docs/plans/issue-73-tile-cascade.md`. Sam first said no (9 November: the operating system already arranges
windows). They were built for 1.2 (18 November) and ship in 1.1.3 with the other built items (19 November).

- Windows, and Linux under X11: Window > Cascade, Tile Top to Bottom and Tile Side by Side, after Minimize and before
  the drawings. They are ChemDraw for Windows' Cascade, Tile Horizontal and Tile Vertical, with names that say where
  the windows go. No default keys, as ChemDraw has none; Settings > Keyboard shortcuts can give each one. The command
  palette finds them by ChemDraw's names too.
- They arrange the drawings the Window menu lists (Home's window only while it holds a drawing; object windows too),
  on the monitor of the window in front, inside its work area. Minimised, full-screen and hidden windows, and windows
  on another virtual desktop, stay as they are; maximised ones are restored first. No window gets smaller than
  Octet's smallest window (800 x 620): where a tile is smaller, the windows overlap evenly. The window in front takes
  the first tile and the top of the cascade, and keeps the focus. The maths is `src-tauri/src/arrange.rs` `places`.
- On Windows, Octet places each window's visible frame (DWM's frame bounds), so the frames touch, as Windows' own
  Tile does.
- The Mac adds Zoom and Bring All to Front, as ChemDraw's Window menu has them. Octet adds no Tile or Cascade of its
  own there: macOS gives Move & Resize (Arrange tiles two to four windows) and Arrange in Front (Bring All to Front
  with Option, a cascade).
- Linux under Wayland: no items. The system does not let an app place its windows, and GNOME and KDE tile them.
- Not in the MCP: they arrange the user's screen and change no drawing, as New, Open, Close and Home.
- Arranging writes nothing: no file, undo step, Edited mark or setting. CDXML's `WindowPosition` and `WindowSize`
  stay `0 0`.
