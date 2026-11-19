# Octet Draw in LibreOffice Writer, Impress, Draw and Calc, on Linux, Windows and the Mac (decision 0025). A
# double-click on a structure that Octet or ChemDraw made opens it in an Octet object window: a PDF picture with the
# drawing's CDXML in it (Octet's copy on the Mac and Linux, ChemDraw's on the Mac), or an EMF picture with Octet's
# CDXML comment (Octet's copy on Windows, Word for Windows). Each Update in Octet puts the new picture in its place as
# one undo step, with its anchor, wrap, rotation and alt text kept and its crop taken off. Other pictures, and every
# picture in a read-only document, keep LibreOffice's own double-click. The context menu gets Edit in Octet Draw, and
# Insert gets Octet Drawing for a new one.
#
# The picture's own bytes go into a new folder (mode 0700): on Linux under
# $XDG_RUNTIME_DIR/app/io.github.samchemman.octet-draw/, which a Flatpak Octet can read and write; on Windows and the
# Mac in the user's temporary folder. The extension starts Octet with fixed arguments and never through a shell:
# - Linux: `octet --object <folder>/drawing.pdf --app Writer --host <document>` (or Impress, Draw, Calc; or the
#   Flatpak's Octet), through the user's service manager.
# - Windows: the same arguments to the program Octet's Office class names (LocalServer32), which gives them to the
#   Octet that runs.
# - The Mac: `/usr/bin/open -b <Octet's id> <folder>/drawing.pdf`, an Apple Event that reaches the Octet that runs or
#   starts one. Apple Events carry no arguments, so the program's and the document's names go in a file named
#   `object` beside the picture, which Octet reads (objects.rs, marked).
# Octet writes each Update over the file in one step, and an empty `closed` file when its window closes. The extension
# looks at the folder four times a second, as LibreOffice's own external editing does, and writes an empty `gone` file
# when the document closes first. No port, socket or network. Each file from Octet is read as hostile: a PDF or EMF of
# 64 MB at most, which LibreOffice's own readers open.
import os
import re
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import threading
import time
import zlib

import uno
import unohelper
from com.sun.star.awt import XCallback, XMouseClickHandler
from com.sun.star.document import XUndoAction
from com.sun.star.lang import XEventListener
from com.sun.star.util import XCloseListener
from com.sun.star.task import XJob, XJobExecutor
from com.sun.star.ui import XContextMenuInterceptor

APP_ID = "io.github.samchemman.octet-draw"
SERVICE = "io.github.samchemman.octet.LibreOffice"
MAX_BYTES = 64 << 20
# "linux", "win32" or "darwin". Linux works as in Octet 1.1.2.
SYSTEM = sys.platform
# Every file is opened with these: never through a link where the system can say so, and on Windows as bytes. Windows'
# Python has no O_NOFOLLOW, and only Windows has O_BINARY.
NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
BINARY = getattr(os, "O_BINARY", 0)
# Octet's Office class on Windows (decision 0023): its LocalServer32 names the program.
CLSID = "{211EF98F-E45E-42C8-9D49-A10D2D394DB2}"
# What Octet's window needs from the session, when the user's service manager starts it.
PASS = ("DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS", "XDG_SESSION_TYPE", "XDG_CURRENT_DESKTOP", "LANG")
# The documents the extension works in, and each program's name for Octet's Update button (Update in Writer).
DOCUMENTS = (("com.sun.star.text.TextDocument", "Writer"), ("com.sun.star.presentation.PresentationDocument", "Impress"), ("com.sun.star.drawing.DrawingDocument", "Draw"), ("com.sun.star.sheet.SpreadsheetDocument", "Calc"))
NOT_FOUND = "LibreOffice cannot find Octet Draw. Open Octet Draw once, then try again."
READ_ONLY = "This document is read-only."

SESSIONS = []  # the pictures open in Octet
ATTACHED = []  # the views with the double-click and the context menu item
LOCK = threading.Lock()
WATCHER = []  # the thread that looks at the folders, while there are sessions


def prop(name, value):
    p = uno.createUnoStruct("com.sun.star.beans.PropertyValue")
    p.Name, p.Value = name, value
    return p


def service(ctx, name, *args):
    if args:
        return ctx.ServiceManager.createInstanceWithArgumentsAndContext(name, args, ctx)
    return ctx.ServiceManager.createInstanceWithContext(name, ctx)


# ---- What Octet can open ----

# The picture's own file as LibreOffice keeps it, and its kind ("pdf" or "emf"): its graphic written in LibreOffice's
# own form, which is a 4-byte mark ("0fdp" for a PDF, "0fme" for an EMF), the length, then the file. None for every
# other picture.
MIMES = ("application/pdf", "image/x-emf", "image/emf")
MARKS = {b"0fdp": "pdf", b"0fme": "emf"}


def picture_of(ctx, graphic):
    try:
        if graphic is None or graphic.MimeType not in MIMES:
            return None
        stream = service(ctx, "com.sun.star.comp.MemoryStream")
        service(ctx, "com.sun.star.graphic.GraphicProvider").storeGraphic(graphic, (prop("OutputStream", stream), prop("MimeType", "image/x-vclgraphic")))
        stream.seek(0)
        data = bytes(stream.readBytes(None, min(stream.getLength(), MAX_BYTES + 8))[1].value)
    except Exception:
        return None
    return unwrapped(data)


# The file in LibreOffice's form of a picture, and its kind. None if it is not a whole PDF or EMF.
def unwrapped(data):
    kind = MARKS.get(data[:4])
    if kind is None or len(data) < 8:
        return None
    n = struct.unpack("<I", data[4:8])[0]
    body = data[8:8 + n]
    return (kind, body) if len(body) == n and kind_of(body) == kind else None


# "pdf" or "emf" by a file's first bytes (an EMF's header record, with " EMF" at byte 40), else None.
def kind_of(data):
    if data.startswith(b"%PDF"):
        return "pdf"
    if data[:4] == b"\x01\x00\x00\x00" and data[40:44] == b" EMF":
        return "emf"
    return None


# Whether a picture (an EMF, else a PDF) holds a drawing. Octet reads it again with its own limits; this only decides
# whether a double-click is Octet's.
def has_drawing(data):
    return emf_has_drawing(data) if kind_of(data) == "emf" else pdf_has_drawing(data)


# A PDF: a stream marked /Type /Metadata /Subtype /XML (Octet's and ChemDraw's catalog /Metadata) whose text starts as
# CDXML. At most 2,000 places with the word `stream` (a stream has two: `stream` and `endstream`), and the first 4 KB of
# each stream.
def pdf_has_drawing(pdf):
    at, seen = 0, 0
    while seen < 2000:
        at = pdf.find(b"stream", at)
        if at < 0:
            return False
        start, at = at, at + 6
        seen += 1
        if pdf[start - 3:start] == b"end":
            continue
        head = pdf[max(0, start - 2048):start]
        if b"obj" not in head:
            continue
        d = head[head.rfind(b"obj"):]
        if not (re.search(rb"/Type\s*/Meta[Dd]ata\b", d) and re.search(rb"/Subtype\s*/XML\b", d)):
            continue
        data = pdf[at:at + 65536].lstrip(b"\r\n")
        text = data[:4096]
        # Deflated with /FlateDecode, or with no filter: LibreOffice keeps a PDF newer than 1.6 as pdfium saves it at
        # 1.6, which takes the /Filter off this stream.
        if b"/FlateDecode" in d or data[:1] == b"x":
            try:
                text = zlib.decompressobj().decompress(data, 4096)
            except zlib.error:
                continue
        if b"<CDXML" in text or b"<!DOCTYPE CDXML" in text:
            return True
    return False


# An EMF: Octet's comment (EMR_COMMENT, record 70, whose data starts with this tag) with CDXML in its first 4 KB, among
# the first 64 records. Octet puts it right after the header; Office's Mac EMF has its PDF comment first. Each record
# is 8 bytes or more, a multiple of 4, and inside the file; the end record (14) ends the search.
EMF_TAG = b"Octet CDXML\0"


def emf_has_drawing(emf):
    at = 0
    for _ in range(64):
        if at + 8 > len(emf):
            return False
        kind, size = struct.unpack_from("<II", emf, at)
        if size < 8 or size % 4 or at + size > len(emf):
            return False
        if kind == 70 and size >= 12:
            n = struct.unpack_from("<I", emf, at + 8)[0]
            data = emf[at + 12:at + 12 + min(n, size - 12, len(EMF_TAG) + 4096)]
            if data.startswith(EMF_TAG):
                return b"<CDXML" in data
        if kind == 14:
            return False
        at += size
    return False


# The one picture selected: Writer's image, or one image in Impress or Draw.
def selected_picture(controller):
    try:
        sel = controller.getSelection()
        if sel.supportsService("com.sun.star.text.TextGraphicObject"):
            return sel
        if sel.getCount() == 1 and sel.getByIndex(0).supportsService("com.sun.star.drawing.GraphicObjectShape"):
            return sel.getByIndex(0)
    except Exception:
        pass
    return None


# Whether the document is read-only: then the extension leaves its pictures to LibreOffice.
def read_only(controller):
    try:
        return bool(controller.getModel().isReadonly())
    except Exception:
        return False


# ---- Octet ----

# The program Octet says it is (an AppImage can be anywhere): the path in $XDG_CONFIG_HOME/<Octet's id>/octet-path,
# which Octet writes when it starts. The file is the user's own, only the user can change it, and it is no link. The
# program is a real path (no link in it) to a file that runs, that the user or root owns, and that other users cannot
# change. None if not.
def noted_octet():
    config = os.environ.get("XDG_CONFIG_HOME", "")
    if not os.path.isabs(config):
        config = os.path.expanduser("~/.config")
    try:
        fd = os.open(os.path.join(config, APP_ID, "octet-path"), os.O_RDONLY | NOFOLLOW | BINARY)
        with os.fdopen(fd, "rb") as f:
            st = os.fstat(f.fileno())
            data = f.read(4097)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o022 or len(data) > 4096:
            return None
        path = os.fsdecode(data)
        program = os.lstat(path)
    except (OSError, ValueError):
        return None
    if not os.path.isabs(path) or os.path.realpath(path) != path or not stat.S_ISREG(program.st_mode):
        return None
    if program.st_uid not in (0, os.getuid()) or program.st_mode & 0o002 or not os.access(path, os.X_OK):
        return None
    return path


# Octet as it said it is (an AppImage, or any build), else from the .deb or .rpm, else the Flatpak, else an `octet` on
# the PATH.
def octet():
    noted = noted_octet()
    if noted:
        return [noted]
    if os.access("/usr/bin/octet", os.X_OK):
        return ["/usr/bin/octet"]
    flatpak = shutil.which("flatpak")
    if flatpak and any(os.path.isdir(os.path.join(d, "app", APP_ID)) for d in (os.path.expanduser("~/.local/share/flatpak"), "/var/lib/flatpak")):
        return [flatpak, "run", APP_ID]
    found = shutil.which("octet")
    return [found] if found else None


# Windows: the program Octet's Office class names. The installer writes it, and each Octet repairs it when it starts
# (decision 0023), so it names the Octet that ran last. Taken only as a quoted or plain absolute path on a drive
# (X:\...\name.exe) with no arguments, no network path and no . or .. folder, to a real file that is no link. None if
# not. `lstat` is os.lstat (a test gives its own).
def windows_octet(lstat=os.lstat):
    try:
        import winreg
    except ImportError:
        return None
    key = "Software\\Classes\\CLSID\\" + CLSID + "\\LocalServer32"
    for view in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_READ | view) as k:
                value, kind = winreg.QueryValueEx(k, "")
        except OSError:
            continue
        program = server_program(value, lstat) if kind == winreg.REG_SZ else None
        if program:
            return program
    return None


EXE = re.compile(r'[A-Za-z]:\\[^/:*?"<>|\x00-\x1f]*\.[Ee][Xx][Ee]')


def server_program(value, lstat=os.lstat):
    if not isinstance(value, str):
        return None
    v = value.strip()
    if len(v) > 2 and v[0] == '"' and v[-1] == '"':
        v = v[1:-1]
    if not EXE.fullmatch(v) or any(part in (".", "..", "") for part in v[3:].split("\\")):
        return None
    try:
        st = lstat(v)
    except (OSError, ValueError):
        return None
    # FILE_ATTRIBUTE_REPARSE_POINT: a link or a junction.
    if not stat.S_ISREG(st.st_mode) or getattr(st, "st_file_attributes", 0) & 0x400:
        return None
    return v


# Octet's arguments on Linux and Windows. Octet takes the word after each flag as its value, so a document named
# --convert is only a name. With no program (not one of DOCUMENTS), Octet's Update button names the document.
def arguments(path, program, title):
    return ["--object", path] + (["--app", program] if program else []) + ["--host", title]


# Linux. Octet notes its place each time it starts, so an Octet that was moved is found after it opens once. Through
# the user's service manager, as the desktop starts programs, not as LibreOffice's child: Ubuntu confines LibreOffice
# with AppArmor, and a Flatpak cannot start under it ("bwrap: setting up uid map: Permission denied"). The window's
# environment goes with it. systemd reads $ in a command as a variable: $$ is a $. With no user service manager, Octet
# starts as LibreOffice's child. KillMode=process: when that Octet ends, the service manager leaves the programs it
# started (the Octet that starts after an update, a browser for a link).
def launch_linux(args):
    command = octet()
    if command is None:
        return False
    args = command + args
    manager = shutil.which("systemd-run")
    if manager:
        setenv = ["--setenv=%s=%s" % (k, os.environ[k]) for k in PASS if k in os.environ]
        try:
            if subprocess.run([manager, "--user", "--quiet", "--collect", "--property=KillMode=process"] + setenv + ["--"] + [a.replace("$", "$$") for a in args], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10).returncode == 0:
                return True
        except (OSError, ValueError, subprocess.TimeoutExpired):
            pass
    env = {k: v for k, v in os.environ.items() if k not in ("LD_LIBRARY_PATH", "LD_PRELOAD")}
    # A start that fails (the program is gone, or the system cannot pass the document's name): the user hears it.
    try:
        child = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True, env=env)
    except (OSError, ValueError):
        return False
    threading.Thread(target=child.wait, daemon=True).start()
    return True


# Windows: the program Octet's Office class names, with the arguments as a list (no shell). Python writes the command
# line by Microsoft's rules, and Octet reads it back by the same rules. The Octet that starts gives the request to the
# Octet that runs, if one does, and ends. Detached, with no console, and without LibreOffice's own Python settings.
# Windows lets a program come to the front only when the program in front allows it: LibreOffice allows it first.
DETACHED = 0x00000008 | 0x00000200  # DETACHED_PROCESS, CREATE_NEW_PROCESS_GROUP


def launch_windows(args):
    program = windows_octet()
    if program is None:
        return False
    try:
        import ctypes
        ctypes.windll.user32.AllowSetForegroundWindow(-1)  # ASFW_ANY
    except Exception:
        pass
    env = {k: v for k, v in os.environ.items() if k.upper() not in ("PYTHONHOME", "PYTHONPATH")}
    try:
        child = subprocess.Popen([program] + args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True, creationflags=DETACHED, env=env)
    except (OSError, ValueError):
        return False
    threading.Thread(target=child.wait, daemon=True).start()
    return True


# The Mac: `object` beside the picture, with the program's name, a line end, then the document's name (its own line
# ends made spaces), written once, at the first request. Then `open -b`, which gives the picture to the Octet that runs,
# or starts one. False if Octet is not installed (open ends with 1 at once). An open that takes over 10 s (a first start
# that waits for macOS's question about a program from the Internet) has asked for the picture already: Octet opens it
# when it starts, so the session and its folder stay.
LINE_ENDS = re.compile("[\r\n\x0b\x0c\x1c-\x1e\x85\u2028\u2029]")


def launch_mac(folder, path, program, title):
    try:
        write_new(os.path.join(folder, "object"), (program + "\n" + LINE_ENDS.sub(" ", title)).encode("utf-8", "replace"))
    except FileExistsError:
        pass
    except OSError:
        return False
    try:
        done = subprocess.run(["/usr/bin/open", "-b", APP_ID, path], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
    except subprocess.TimeoutExpired:
        return True
    except (OSError, ValueError):
        return False
    return done.returncode == 0


# A new private folder. Linux: in the folder a Flatpak Octet shares with the system, else a temporary folder. Windows
# and the Mac: the user's own temporary folder (mode 0700 on the Mac; on Windows, in the user's profile).
def new_folder():
    if SYSTEM in ("win32", "darwin"):
        return tempfile.mkdtemp(prefix="octet-libreoffice-")
    run = os.environ.get("XDG_RUNTIME_DIR")
    if not run:
        return tempfile.mkdtemp(prefix="octet-")
    base = os.path.join(run, "app", APP_ID)
    os.makedirs(base, mode=0o700, exist_ok=True)
    st = os.lstat(base)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid():
        raise OSError("Octet's folder is not the user's own: " + base)
    return tempfile.mkdtemp(prefix="libreoffice-", dir=base)


# A new file: never through a link, and never over a file that is there.
def write_new(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW | BINARY, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)


# The file as it is now: a new file (Octet's Update renames one over it) or new bytes. None if it is not a file.
def stamp(path):
    try:
        st = os.lstat(path)
    except OSError:
        return None
    return (st.st_ino, st.st_mtime_ns, st.st_size) if stat.S_ISREG(st.st_mode) else None


# The picture that Octet wrote, a PDF or an EMF (64 MB at most, never through a link, else None), and the stamp of the
# file that was read: Octet can rename a newer one over it between a look and the read. False if it cannot be read now
# (Windows: Octet is putting the next one in its place), so it is looked at again.
def read_picture(path):
    try:
        fd = os.open(path, os.O_RDONLY | NOFOLLOW | BINARY)
        with os.fdopen(fd, "rb") as f:
            st = os.fstat(f.fileno())
            read = (st.st_ino, st.st_mtime_ns, st.st_size)
            if st.st_size > MAX_BYTES:
                return None, read
            data = f.read(MAX_BYTES + 1)
    except OSError:
        return False, None
    return (data if len(data) <= MAX_BYTES and kind_of(data) else None), read


def message(ctx, controller, text):
    try:
        window = controller.getFrame().getContainerWindow()
        kind = uno.Enum("com.sun.star.awt.MessageBoxType", "WARNINGBOX")
        service(ctx, "com.sun.star.awt.Toolkit").createMessageBox(window, kind, 1, "Octet Draw", text).execute()
    except Exception:
        pass


# Runs `f` on LibreOffice's main thread, where documents change.
class Call(unohelper.Base, XCallback):
    def __init__(self, f):
        self.f = f

    def notify(self, data):
        self.f()


def on_main(ctx, f):
    service(ctx, "com.sun.star.awt.AsyncCallback").addCallback(Call(f), None)


# ---- One picture open in Octet ----

class Session:
    def __init__(self, ctx, controller, shape, kind, at=None):
        self.ctx, self.controller, self.doc, self.shape, self.at = ctx, controller, controller.getModel(), shape, at
        self.folder = new_folder()
        self.path = os.path.join(self.folder, "drawing." + kind)
        self.seen = None  # the file as the extension last read it
        self.gone = False

    # Octet opens the file, or brings its window to the front. False if Octet is not there or does not start: the
    # user hears it.
    def launch(self):
        # The program's name for Octet's Update button (Update in Writer), and the first 260 characters of the
        # document's name, which is all Octet keeps of it. No system passes a NUL to a program.
        try:
            program = next((name for service_name, name in DOCUMENTS if self.doc.supportsService(service_name)), "")
            title = self.doc.getTitle()
        except Exception:
            program, title = "", "Document"
        title = title.replace("\0", "")[:260]
        if SYSTEM == "darwin":
            started = launch_mac(self.folder, self.path, program, title)
        elif SYSTEM == "win32":
            started = launch_windows(arguments(self.path, program, title))
        else:
            started = launch_linux(arguments(self.path, program, title))
        if not started:
            message(self.ctx, self.controller, NOT_FOUND)
        return started

    # Octet's new picture goes in place of the old one, as one undo step. The picture keeps its anchor, wrap, rotation,
    # flip, alt text and name, and takes the new drawing's own size, as on Windows. A crop comes off: it was made for the
    # old drawing and would cut the new one anywhere. Undo puts the old picture back with its size and crop.
    def put(self, data):
        if self.gone:
            return
        try:
            stream = service(self.ctx, "com.sun.star.io.SequenceInputStream", uno.ByteSequence(data))
            graphic = service(self.ctx, "com.sun.star.graphic.GraphicProvider").queryGraphic((prop("InputStream", stream),))
            size = graphic.Size100thMM
        except Exception:
            return
        undo = self.doc.getUndoManager()
        try:
            if self.shape is None:
                undo.enterUndoContext("Octet Drawing")
                try:
                    self.shape = self.insert(graphic, size, data)
                finally:
                    undo.leaveUndoContext()
                return
            # Impress and Draw keep no undo step for a changed picture, so the step is Octet's own, in every program.
            before = (self.shape.Graphic, self.shape.Size, crop_of(self.shape))
            whole = uno.createUnoStruct("com.sun.star.text.GraphicCrop") if before[2] is not None else None
            undo.lock()
            try:
                swap(self.shape, graphic, size, whole)
            finally:
                undo.unlock()
            undo.addUndoAction(Swap(self.shape, before, (graphic, self.shape.Size, whole)))
        except Exception:
            self.went()  # the picture or its document is gone

    # A new drawing. In Writer, in line at the cursor (Writer's Insert > Image would put it over a picture that is
    # selected). In Impress, Draw and Calc, LibreOffice's own Insert > Image, for its usual place and size: a picture
    # they add through the API has no undo step. Insert > Image reads a private copy of the picture checked above.
    # Octet's file can be gone by now (its window closed), or be a link. On Windows LibreOffice can still hold the copy
    # when Insert > Image ends: it stays in the temporary folder, and the drawing goes on.
    def insert(self, graphic, size, data):
        if self.at is not None:
            shape = self.doc.createInstance("com.sun.star.text.TextGraphicObject")
            shape.AnchorType = uno.Enum("com.sun.star.text.TextContentAnchorType", "AS_CHARACTER")
            swap(shape, graphic, size)
            # The place saved at Insert can be gone (its table or frame deleted): then where the cursor is now.
            try:
                self.at.getText().insertTextContent(self.at, shape, False)
            except Exception:
                self.at = text_cursor(self.controller)
                self.at.getText().insertTextContent(self.at, shape, False)
            return shape
        fd, name = tempfile.mkstemp(suffix="." + (kind_of(data) or "pdf"))
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            url = uno.systemPathToFileUrl(name)
            service(self.ctx, "com.sun.star.frame.DispatchHelper").executeDispatch(self.controller.getFrame(), ".uno:InsertGraphic", "", 0, (prop("FileName", url), prop("AsLink", False)))
        finally:
            try:
                os.unlink(name)
            except OSError:
                pass
        return selected_picture(self.controller)

    # The document closed, or the picture is gone: Octet's window says so and keeps the drawing for Save Copy As.
    def went(self):
        if not self.gone:
            self.gone = True
            try:
                write_new(os.path.join(self.folder, "gone"), b"")
            except OSError:
                pass


# The picture's crop (Writer's pictures and the drawing programs' have one), or None.
def crop_of(shape):
    try:
        return shape.GraphicCrop
    except Exception:
        return None


def swap(shape, graphic, size, crop=None):
    shape.Graphic = graphic
    if crop is not None:
        try:
            shape.GraphicCrop = crop
        except Exception:
            pass
    if size.Width > 0 and size.Height > 0:
        shape.Size = size


# Edit > Undo and Redo of an Update: the picture, size and crop before it, and after it.
class Swap(unohelper.Base, XUndoAction):
    def __init__(self, shape, before, after):
        self.Title = "Octet Drawing"
        self.shape, self.before, self.after = shape, before, after

    # A picture deleted since (or put back as a new copy by LibreOffice's own Undo) is gone: LibreOffice clears its whole
    # Undo list when an undo action raises, so this one does nothing then.
    def undo(self):
        try:
            swap(self.shape, *self.before)
        except Exception:
            pass

    def redo(self):
        try:
            swap(self.shape, *self.after)
        except Exception:
            pass


class Closing(unohelper.Base, XCloseListener):
    def __init__(self, session):
        self.session = session

    def queryClosing(self, event, ownership):
        pass

    def notifyClosing(self, event):
        self.session.went()

    def disposing(self, event):
        self.session.went()


# Windows and the Mac: a session whose LibreOffice quit before Octet's window closed leaves its folder, which no one
# watches; Windows does not empty its temporary folder. At the first double-click or Insert after LibreOffice starts,
# the extension's own folders in which Octet wrote `closed` go. (Linux's are in $XDG_RUNTIME_DIR, emptied at log-out.)
SWEPT = []


def sweep():
    if SWEPT or SYSTEM not in ("win32", "darwin"):
        return
    SWEPT.append(True)
    base = tempfile.gettempdir()
    try:
        names = [n for n in os.listdir(base) if n.startswith("octet-libreoffice-")]
    except OSError:
        return
    for name in names:
        folder = os.path.join(base, name)
        try:
            if stat.S_ISDIR(os.lstat(folder).st_mode) and os.path.lexists(os.path.join(folder, "closed")):
                shutil.rmtree(folder, ignore_errors=True)
        except OSError:
            pass


def start(session):
    sweep()
    if not session.launch():
        shutil.rmtree(session.folder, ignore_errors=True)
        return
    session.seen = stamp(session.path)
    session.doc.addCloseListener(Closing(session))
    with LOCK:
        SESSIONS.append(session)
        if not WATCHER:
            WATCHER.append(threading.Thread(target=watch, daemon=True))
            WATCHER[0].start()


# Four times a second: each new picture from Octet goes into its document, and a closed window's folder goes. `closed`
# is looked for first: Octet writes the last picture before it. A folder that is gone (removed by hand, or by a tidy-up)
# ends its session too.
def watch():
    while True:
        time.sleep(0.25)
        with LOCK:
            sessions = list(SESSIONS)
            if not sessions:
                WATCHER.clear()
                return
        for s in sessions:
            look(s)


def look(s):
    closed = os.path.lexists(os.path.join(s.folder, "closed")) or not os.path.isdir(s.folder)
    now = stamp(s.path)
    if now is not None and now != s.seen:
        data, read = read_picture(s.path)
        if data is not False:
            # The file that was read: the one looked at, or the newer one Octet renamed over it in between, which is
            # there now. (Compared lstat to lstat, so Windows' two ways of reading a file's stamp never meet.)
            s.seen = now if read == now else stamp(s.path)
        if data:
            on_main(s.ctx, lambda: s.put(data))
    if closed:
        with LOCK:
            SESSIONS.remove(s)
        shutil.rmtree(s.folder, ignore_errors=True)


# Opens the picture in Octet. False if it holds no drawing. A picture open already brings Octet's window to the front.
def edit(ctx, controller, shape):
    with LOCK:
        open_already = [s for s in SESSIONS if s.shape == shape and not s.gone]
    if open_already:
        open_already[0].launch()
        return True
    found = picture_of(ctx, shape.Graphic)
    if found is None or not has_drawing(found[1]):
        return False
    session = Session(ctx, controller, shape, found[0])
    write_new(session.path, found[1])
    start(session)
    return True


# Writer's cursor as a place to insert at: the view cursor, else the selection's start.
def text_cursor(controller):
    try:
        cursor = controller.getViewCursor()
        return cursor.getText().createTextCursorByRange(cursor.getStart())
    except Exception:
        anchor = controller.getSelection().getAnchor()
        return anchor.getText().createTextCursorByRange(anchor)


# Insert > Octet Drawing: an empty file is a new drawing. In Writer it goes in where the cursor is now, or beside the
# picture selected now. In Impress, Draw and Calc it goes on the slide, page or sheet in front at the first Update. A
# read-only document says so.
def insert(ctx, controller):
    if read_only(controller):
        message(ctx, controller, READ_ONLY)
        return
    at = text_cursor(controller) if controller.getModel().supportsService("com.sun.star.text.TextDocument") else None
    # A PDF on every system, which LibreOffice reads the same way on each. (Windows' Copy is an EMF, but LibreOffice on
    # Windows does not keep a pasted EMF as its own bytes, so the PDF is the one kind that stays an Octet drawing.)
    session = Session(ctx, controller, None, "pdf", at)
    write_new(session.path, b"")
    start(session)


# ---- The views ----

class Clicks(unohelper.Base, XMouseClickHandler):
    def __init__(self, ctx, controller):
        self.ctx, self.controller = ctx, controller

    # A double-click with the left button on a drawing: Octet opens it, and LibreOffice does nothing more. In a
    # read-only document LibreOffice keeps its own.
    def mousePressed(self, event):
        if event.ClickCount != 2 or event.Buttons != 1 or read_only(self.controller):
            return False
        shape = selected_picture(self.controller)
        try:
            return shape is not None and edit(self.ctx, self.controller, shape)
        except Exception:
            return False

    def mouseReleased(self, event):
        return False

    def disposing(self, event):
        pass


class Menu(unohelper.Base, XContextMenuInterceptor):
    def __init__(self, ctx):
        self.ctx = ctx

    # Edit in Octet Draw, first in the context menu of a drawing. None in a read-only document.
    def notifyContextMenuExecute(self, event):
        ignored = uno.Enum("com.sun.star.ui.ContextMenuInterceptorAction", "IGNORED")
        try:
            if read_only(event.Selection):
                return ignored
            shape = selected_picture(event.Selection)
            found = shape and picture_of(self.ctx, shape.Graphic)
            if not found or not has_drawing(found[1]):
                return ignored
            menu = event.ActionTriggerContainer
            item = menu.createInstance("com.sun.star.ui.ActionTrigger")
            item.setPropertyValue("Text", "Edit in Octet Draw")
            item.setPropertyValue("CommandURL", "service:" + SERVICE + "?edit")
            line = menu.createInstance("com.sun.star.ui.ActionTriggerSeparator")
            line.setPropertyValue("SeparatorType", 0)
            menu.insertByIndex(0, item)
            menu.insertByIndex(1, line)
            return uno.Enum("com.sun.star.ui.ContextMenuInterceptorAction", "EXECUTE_MODIFIED")
        except Exception:
            return ignored


class Forget(unohelper.Base, XEventListener):
    def disposing(self, event):
        ATTACHED[:] = [c for c in ATTACHED if c != event.Source]


def attach(ctx, controller):
    try:
        if controller is None or any(c == controller for c in ATTACHED):
            return
        if not any(controller.getModel().supportsService(n) for n, _ in DOCUMENTS):
            return
        controller.addMouseClickHandler(Clicks(ctx, controller))
        controller.registerContextMenuInterceptor(Menu(ctx))
        controller.addEventListener(Forget())
        ATTACHED.append(controller)
    except Exception:
        pass


# The job for each new view (Jobs.xcu), and the commands of the menu items (Addons.xcu and the context menu).
class Octet(unohelper.Base, XJob, XJobExecutor):
    def __init__(self, ctx):
        self.ctx = ctx

    def execute(self, args):
        for arg in args:
            if arg.Name == "Environment":
                env = {v.Name: v.Value for v in arg.Value}
                frame, model = env.get("Frame"), env.get("Model")
                attach(self.ctx, frame.getController() if frame else model and model.getCurrentController())
        return None

    def trigger(self, command):
        controller = service(self.ctx, "com.sun.star.frame.Desktop").getCurrentFrame().getController()
        attach(self.ctx, controller)
        if command == "insert":
            insert(self.ctx, controller)
        elif command == "edit" and not read_only(controller):
            shape = selected_picture(controller)
            if shape is not None:
                edit(self.ctx, controller, shape)


g_ImplementationHelper = unohelper.ImplementationHelper()
g_ImplementationHelper.addImplementation(Octet, SERVICE, (SERVICE,))
