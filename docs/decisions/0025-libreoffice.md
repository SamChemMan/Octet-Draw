# 0025: Octet drawings in LibreOffice on Linux

Status: in release 1.1.2. Built 11 November 2026, plan steps L1 to L4, with Update in Writer, Impress and Draw, and
Octet from an AppImage. Tried only in an Ubuntu 24.04 VM (arm64) with LibreOffice 24.2: with Octet built there, as a
Flatpak on GNOME 50, and from a stand-in for the AppImage. Not tried: a real AppImage, x86_64, Wayland, Fedora,
LibreOffice from libreoffice.org, and ChemDraw's own PDF in LibreOffice (see Not done).

Adds to decisions 0011 (the clipboard) and 0023 (the object window). There is no Word for Linux, so LibreOffice
Writer, Impress and Draw get what Word gets on Windows: double-click a structure, edit it in Octet's object window,
and Update puts it back.

## Copy and paste

- Copy on Linux puts, in this order: the PNG (with the CDXML in a chunk), `application/pdf` (the Mac's PDF, with the
  CDXML in its `/Metadata`), the SVG, then the chemistry as before. Octet makes the PDF on a second thread while it
  draws the PNG, so Copy takes no longer than in 1.1.1 (`linux_copy_takes_no_longer`; 7.3 ms against 7.3 ms in the
  VM's release build). If Octet cannot make the PDF (a font it cannot embed), Copy puts the PNG and the SVG, as in
  1.1.1.
- Writer, Impress and Draw paste the PDF, and keep it in `.odt`, `.odp` and `.odg`. LibreOffice saves a PDF newer
  than 1.6 again at 1.6 through pdfium, which takes the `/Filter` off the `/Metadata` stream and leaves it deflated.
  Octet now reads zlib data with no filter as well (`export.rs`, `cdxml_of`).
- Paste in Octet reads the PDF, and LibreOffice's own copy of a picture (`application/x-openoffice-svxb`), which holds
  the PDF as it was pasted in. LibreOffice puts no PDF on the clipboard, and its PNG has no CDXML.

## The extension

`tools/libreoffice`: a Python UNO component, `octet_draw.py`, with `Jobs.xcu`, `Addons.xcu`, `description.xml` and
the manifest. `src-tauri/build.rs` zips them into `gen/octet-draw.oxt`, with Octet's version, and Linux builds
bundle it (`tauri.linux.conf.json`). Settings > General > Add to LibreOffice runs `unopkg gui` on it, and
LibreOffice's Extension Manager asks the user to confirm.

- LibreOffice closed: the manager shows on its own, and LibreOffice has the extension when it next starts. No
  restart.
- LibreOffice open: the manager shows in LibreOffice, which asks to restart once.
- Octet does not open the .oxt as a file (`xdg-open`): that starts a closed LibreOffice with the file as its
  argument, and LibreOffice's restart after the install opens the file again and asks to install it again. Tested in
  the VM on 11 November 2026.
- A Flatpak Octet has no `unopkg`, so it opens the file through the portal. When LibreOffice was closed, its restart
  still asks to install the file again (tried in the VM). Cancel ends it.

- A job on each new view (`OnViewCreated`) adds a mouse handler and a context menu item to Writer, Impress and Draw.
- A double-click with the left button on a picture whose PDF holds CDXML (Octet's or ChemDraw's) opens Octet, and
  LibreOffice does nothing more. Every other picture keeps LibreOffice's own double-click.
- The context menu of such a picture starts with Edit in Octet Draw. Insert > Octet Drawing (after Insert > Image)
  opens an empty object window, and the first Update inserts the drawing: in Writer in line at the cursor, in Impress
  and Draw through LibreOffice's own Insert Image. Insert Image reads a private copy (`mkstemp`) of the PDF the
  extension read and checked. Octet's file can be gone by then: Close and Return writes the drawing and `closed`
  together, and the folder goes.
- A picture that is open already brings Octet's window to the front.

## Between the extension and Octet

- The extension writes the picture's PDF (LibreOffice's own copy of it) into a new folder of mode 0700 under
  `$XDG_RUNTIME_DIR/app/io.github.samchemman.octet-draw/`, the folder a Flatpak Octet shares with the system.
- It runs `octet --object <folder>/drawing.pdf --app Writer --host <document title>`, or `flatpak run
  io.github.samchemman.octet-draw` with the same arguments, as a list, never through a shell. `--app` comes from the
  document's service: `TextDocument` is Writer, `PresentationDocument` is Impress, `DrawingDocument` is Draw. Octet
  cleans the name as it cleans a document's name, and the object window's button says Update in Writer, Update in
  Impress or Update in Draw. With no `--app` (an older extension), the button says Update <document>. It runs it
  through the user's service manager (`systemd-run --user`): Ubuntu confines LibreOffice with AppArmor, and a
  Flatpak started as LibreOffice's child cannot start ("bwrap: setting up uid map: Permission denied"). Octet then
  runs unconfined, as from the app menu. `$` is passed as `$$`, as systemd expands variables. With no user service
  manager, Octet starts as a child.
- The extension first tries the program named in `$XDG_CONFIG_HOME/io.github.samchemman.octet-draw/octet-path`, then
  `/usr/bin/octet`, the Flatpak and `octet` on the PATH. Octet writes that file when it starts and at Add to
  LibreOffice: `$APPIMAGE` when it runs from an AppImage (the release's main Linux download, which can be anywhere),
  else its own program. The file holds only the path, mode 0600, written in one step. The extension reads it as
  hostile: the user's own file, which only the user can change, and no link; and the path a real path with no link
  in it, to a file that runs, that the user or root owns, and that others cannot change. An AppImage that was moved
  since falls through to the next.
- From an AppImage, the programs Octet starts (`unopkg`, `xdg-open` and the other openers) get the session's
  environment. AppImageKit's AppRun and Tauri's GTK hook set `LD_LIBRARY_PATH`, `PATH`, `PYTHONHOME`, `GTK_PATH`,
  `GIO_MODULE_DIR`, `XDG_DATA_DIRS` and others into the AppImage's mount: each list loses its entries in the mount, a
  variable left empty goes, and so do `APPIMAGE`, `APPDIR`, `ARGV0`, `OWD`, `GTK_THEME` and `PYTHONDONTWRITEBYTECODE`.
  The mount counts by `$APPDIR` and by its real path, as AppRun names it by its real path. The program starts in
  `$OWD`, never in the mount. With the AppImage's `PYTHONHOME`, `unopkg add` fails ("unopkg
  failed"): LibreOffice's Python cannot start.
- Octet's single-instance hand-off (D-Bus, under the app's own name, which a Flatpak may own) gives the request to a
  running Octet.
- Update writes the new PDF over the file in one step (a temporary file renamed over it). The extension looks at the
  file four times a second, reads it as hostile (a regular file, 64 MB at most, a PDF), and puts it in place of the
  picture. The picture keeps its anchor, wrap, alt text and name, and takes the drawing's own size, as on Windows.
  The swap is one undo step, "Octet Drawing", in every program: Impress and Draw record none for a changed picture,
  so the step is the extension's own.
- Octet writes an empty `closed` file when the window closes (after the last picture), and the extension removes the
  folder. When the document closes first, or the picture is gone, the extension writes `gone`, and the window's title
  says "Octet Drawing (Report.odt is closed)". Both files are made new, never through a link.

## Not done

- No real AppImage was built in the VM: it has no Tauri CLI, linuxdeploy or libfuse2. The test on 11 November 2026
  used a stand-in: Octet's release build copied into `/tmp/.mount_OctetSim/usr/bin`, with the .oxt beside it, and a
  launcher `~/Apps/Octet-Draw.AppImage` that sets what the AppImage runtime, AppImageKit's AppRun and Tauri's GTK hook
  set, changes to the mount, and starts Octet. Writer's double-click started it through `octet-path`; Add to
  LibreOffice installed the extension with a clean environment; Help > Report a Problem gave `xdg-open` a clean one.
- From an AppImage, `unopkg` reads the .oxt in the mount. If Octet quits before the user confirms the install, the
  file is gone.
- From an AppImage, AppRun starts Octet in its mount, so a relative path typed after the AppImage in a terminal is
  read in the mount and opens nothing. The extension and file managers give full paths.
- A Flatpak Octet cannot write the system's `octet-path` (its config folder is its own). A user who ran an AppImage
  and then installed the Flatpak gets the AppImage on a double-click while that file is still there.
- Pictures from Windows Word (EMF with CDXML) and PNGs pasted before this change open nothing: LibreOffice keeps no
  original bytes of a PNG.
- Not tried: x86_64, Wayland (Octet's window can open behind LibreOffice), Fedora, LibreOffice from libreoffice.org,
  and ChemDraw's own PDF in LibreOffice. A LibreOffice installed as a Flatpak cannot start Octet. Distributions that
  split Python out of LibreOffice need `libreoffice-script-provider-python`.
