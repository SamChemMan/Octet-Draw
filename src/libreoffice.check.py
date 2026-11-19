# Run by src/libreoffice.check.ts: python3 -I -B src/libreoffice.check.py tools/libreoffice. The extension's Windows
# and Mac branches, EMF pictures, Calc, read-only documents, crops and Undo, and the timing of the double-click check
# (issue 48, docs/plans/issue-48-libreoffice-win-mac.md). LibreOffice is not here: its UNO modules, winreg, ctypes and
# the programs the extension starts are stand-ins. The last line printed is the timing, as JSON.
import json
import os
import stat
import struct
import subprocess
import sys
import tempfile
import time
import types
import atexit
import shutil

# Every folder the extension makes goes in a temporary folder of this check's own, removed at the end.
tempfile.tempdir = tempfile.mkdtemp(prefix="octet-check-")
atexit.register(shutil.rmtree, tempfile.tempdir, True)


class Any:
    def __init__(self, *a, **k):
        pass

    def __getattr__(self, n):
        return lambda *a, **k: None


made = {}


class Module(types.ModuleType):
    def __getattr__(self, n):
        return made.setdefault((self.__name__, n), type(n, (Any,), {}))


for n in ["unohelper", "com", "com.sun", "com.sun.star", "com.sun.star.awt", "com.sun.star.document", "com.sun.star.lang", "com.sun.star.task", "com.sun.star.ui", "com.sun.star.util"]:
    sys.modules[n] = Module(n)
uno = types.ModuleType("uno")
uno.createUnoStruct = lambda name: types.SimpleNamespace(struct=name, Top=0, Bottom=0, Left=0, Right=0)
uno.ByteSequence = bytes
uno.Enum = lambda kind, value: (kind, value)
uno.systemPathToFileUrl = lambda p: "file://" + p
sys.modules["uno"] = uno
sys.path.insert(0, sys.argv[1])
import octet_draw as od  # noqa: E402

NOT_FOUND = "LibreOffice cannot find Octet Draw. Open Octet Draw once, then try again."
said = []
od.message = lambda ctx, controller, text: said.append(text)


# ---- Pictures: EMF and PDF, in LibreOffice's own form ----

def record(kind, data=b""):
    data += b"\0" * (-len(data) % 4)
    return struct.pack("<II", kind, 8 + len(data)) + data


def comment(data):
    pad = data + b"\0" * (-len(data) % 4)
    return struct.pack("<III", 70, 12 + len(pad), len(data)) + pad


# An EMF as Octet makes it: the header (" EMF" at byte 40), Octet's comment, drawing records, the end.
def emf(*middle, eof=True):
    head = struct.pack("<I", 1) + struct.pack("<I", 108) + b"\0" * 32 + b" EMF" + b"\0" * 64
    return head + b"".join(middle) + (record(14, b"\0" * 12) if eof else b"")


CDXML = b'<?xml version="1.0" encoding="UTF-8" ?><CDXML><page/></CDXML>'
octet_emf = emf(comment(b"Octet CDXML\0" + CDXML), record(17, struct.pack("<I", 8)), record(9, struct.pack("<ii", 100, 100)))
# Office's EMF on the Mac: the PDF in a comment first (GDIC), then Octet's.
office_emf = emf(comment(b"GDIC" + b"\0" * 40 + b"%PDF-1.7\n" + b"x" * 5000), comment(b"Octet CDXML\0" + CDXML))
assert od.kind_of(octet_emf) == "emf" and od.kind_of(b"%PDF-1.4") == "pdf" and od.kind_of(b"\x89PNG") is None
cases = {
    "Octet's EMF": (octet_emf, True),
    "Office's Mac EMF": (office_emf, True),
    "ChemDraw's EMF, no comment": (emf(record(17, b"\0" * 4), record(9, b"\0" * 8)), False),
    "another program's comment": (emf(comment(b"GDIC" + CDXML)), False),
    "Octet's tag and no CDXML": (emf(comment(b"Octet CDXML\0" + b"<x/>")), False),
    "CDXML after 4 KB": (emf(comment(b"Octet CDXML\0" + b" " * 4100 + CDXML)), False),
    "not UTF-8 (Octet refuses it)": (emf(comment(b"Octet CDXML\0<CDXML>\xff\xfe</CDXML>")), True),
    "a record of size 0": (emf(struct.pack("<II", 17, 0), comment(b"Octet CDXML\0" + CDXML)), False),
    "a record of size 3": (emf(struct.pack("<II", 17, 3), comment(b"Octet CDXML\0" + CDXML)), False),
    "a record of size 2^32-4": (emf(struct.pack("<II", 17, 2 ** 32 - 4), comment(b"Octet CDXML\0" + CDXML)), False),
    "the comment past the end": (emf(struct.pack("<III", 70, 4000, 3988) + b"Octet CDXML\0" + CDXML, eof=False), False),
    "10,000 records before the comment": (emf(*[record(17, b"\0" * 4)] * 10000, comment(b"Octet CDXML\0" + CDXML)), False),
    "62 records before the comment": (emf(*[record(17, b"\0" * 4)] * 62, comment(b"Octet CDXML\0" + CDXML)), True),
    "the end record first": (emf(record(14, b"\0" * 12), comment(b"Octet CDXML\0" + CDXML)), False),
    "cut short": (octet_emf[:120], False),
    "a header only": (emf(eof=False), False),
    "empty": (b"", False),
}
for name, (data, want) in cases.items():
    assert od.has_drawing(data) is want, name
# LibreOffice's own form: the mark, the length, the file. A mark that does not match the file, or a file cut short, is
# not a picture Octet opens.
pdf = b"%PDF-1.7\n1 0 obj\n<< /Type /Metadata /Subtype /XML >>\nstream\n" + CDXML + b"\nendstream\nendobj\n%%EOF\n"
wrap = lambda mark, body, n=None: mark + struct.pack("<I", len(body) if n is None else n) + body
assert od.unwrapped(wrap(b"0fme", octet_emf)) == ("emf", octet_emf)
assert od.unwrapped(wrap(b"0fdp", pdf)) == ("pdf", pdf)
assert od.unwrapped(wrap(b"0fme", pdf)) is None and od.unwrapped(wrap(b"0fdp", octet_emf)) is None, "the mark and the file differ"
assert od.unwrapped(wrap(b"0fme", octet_emf, len(octet_emf) + 1)) is None, "cut short"
assert od.unwrapped(wrap(b"0fmw", octet_emf)) is None, "a WMF"
assert od.unwrapped(b"0fme") is None and od.unwrapped(b"") is None


# picture_of: LibreOffice writes the picture into a memory stream; 64 MB at most is read (S2).
class Stream:
    data = b""

    def seek(self, n):
        pass

    def getLength(self):
        return len(self.data)

    def readBytes(self, _, n):
        return n, types.SimpleNamespace(value=self.data[:n])


class Provider:
    def storeGraphic(self, graphic, props):
        next(p.Value for p in props if p.Name == "OutputStream").data = graphic.stored

    def queryGraphic(self, props):
        data = bytes(next(p.Value for p in props if p.Name == "InputStream"))
        return types.SimpleNamespace(Size100thMM=types.SimpleNamespace(Width=2540, Height=1270), data=data)


dispatched = []


class Dispatcher:
    def executeDispatch(self, frame, command, target, flags, props):
        dispatched.append((command, {p.Name: p.Value for p in props}))


def service(ctx, name, *args):
    return {"com.sun.star.comp.MemoryStream": Stream, "com.sun.star.graphic.GraphicProvider": Provider, "com.sun.star.frame.DispatchHelper": Dispatcher}.get(name, lambda: args[0] if args else None)()


od.service = service
graphic = lambda mime, stored: types.SimpleNamespace(MimeType=mime, stored=stored)
assert od.picture_of(None, graphic("image/x-emf", wrap(b"0fme", octet_emf))) == ("emf", octet_emf)
assert od.picture_of(None, graphic("image/emf", wrap(b"0fme", office_emf))) == ("emf", office_emf)
assert od.picture_of(None, graphic("application/pdf", wrap(b"0fdp", pdf))) == ("pdf", pdf)
assert od.picture_of(None, graphic("image/png", wrap(b"0fdp", pdf))) is None, "a PNG is not looked at"
assert od.picture_of(None, None) is None
big = b"%PDF" + b"\0" * (od.MAX_BYTES - 4)
assert od.picture_of(None, graphic("application/pdf", wrap(b"0fdp", big))) == ("pdf", big), "64 MB"
assert od.picture_of(None, graphic("application/pdf", wrap(b"0fdp", big + b"\0"))) is None, "64 MB and 1 byte"
del big

# The picture Octet writes: a PDF or an EMF, 64 MB at most, never through a link.
folder = tempfile.mkdtemp()
for name, data, want in [("a.pdf", pdf, pdf), ("b.emf", octet_emf, octet_emf), ("c.png", b"\x89PNG", None), ("d.pdf", b"", None)]:
    with open(os.path.join(folder, name), "wb") as f:
        f.write(data)
    assert od.read_picture(os.path.join(folder, name))[0] == want, name
os.symlink(os.path.join(folder, "a.pdf"), os.path.join(folder, "link.pdf"))
assert od.read_picture(os.path.join(folder, "link.pdf")) == (False, None), "a link is not read"
with open(os.path.join(folder, "huge.pdf"), "wb") as f:
    f.write(b"%PDF")
    f.truncate(od.MAX_BYTES + 1)
assert od.read_picture(os.path.join(folder, "huge.pdf"))[0] is None, "over 64 MB"


# ---- Documents, pictures and sessions ----

class Undo:
    def __init__(self):
        self.actions, self.locked, self.contexts = [], 0, []

    def lock(self):
        self.locked += 1

    def unlock(self):
        self.locked -= 1

    def addUndoAction(self, a):
        self.actions.append(a)

    def enterUndoContext(self, title):
        self.contexts.append(title)

    def leaveUndoContext(self):
        pass


class Document:
    def __init__(self, kind="com.sun.star.text.TextDocument", title="Report.odt", readonly=False):
        self.kind, self.title, self.readonly, self.undo, self.listeners = kind, title, readonly, Undo(), []

    def supportsService(self, name):
        return name == self.kind

    def getTitle(self):
        return self.title

    def isReadonly(self):
        return self.readonly

    def getUndoManager(self):
        return self.undo

    def addCloseListener(self, listener):
        self.listeners.append(listener)


class Shapes:
    def __init__(self, *shapes):
        self.shapes = shapes

    def supportsService(self, name):
        return False

    def getCount(self):
        return len(self.shapes)

    def getByIndex(self, k):
        return self.shapes[k]


class Picture:
    def __init__(self, data=None, crop=True, service="com.sun.star.drawing.GraphicObjectShape"):
        self.Graphic = data and graphic("image/x-emf", wrap(b"0fme", data))
        self.Size = types.SimpleNamespace(Width=500, Height=500)
        self.RotateAngle, self.Description, self.service = 4500, "Aspirin", service
        if crop:
            self.GraphicCrop = types.SimpleNamespace(Top=100, Bottom=0, Left=50, Right=0)

    def supportsService(self, name):
        return name == self.service


class Controller:
    def __init__(self, doc, selection=None):
        self.doc, self.selection = doc, selection

    def getModel(self):
        return self.doc

    def getSelection(self):
        return self.selection

    def getFrame(self):
        return None


started = []


def run(args, **options):
    started.append(("run", args, options))
    return types.SimpleNamespace(returncode=run.code)


run.code = 0


def popen(args, **options):
    started.append(("popen", args, options))
    if popen.fail:
        raise OSError("gone")
    return types.SimpleNamespace(wait=lambda: 0)


popen.fail = False
subprocess.run, subprocess.Popen = run, popen


# ---- Windows (J2, J4, S5, S6) ----

class Key:
    def __init__(self, value):
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


winreg = types.ModuleType("winreg")
winreg.HKEY_CURRENT_USER, winreg.KEY_READ, winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY, winreg.REG_SZ, winreg.REG_EXPAND_SZ = "HKCU", 0x20019, 0x100, 0x200, 1, 2
registry = {}
opened = []


def open_key(root, key, reserved, access):
    opened.append((root, key, access))
    if access not in registry:
        raise FileNotFoundError(key)
    return Key(registry[access])


winreg.OpenKey = open_key
winreg.QueryValueEx = lambda k, name: k.value
sys.modules["winreg"] = winreg
allowed = []
ctypes = types.ModuleType("ctypes")
ctypes.windll = types.SimpleNamespace(user32=types.SimpleNamespace(AllowSetForegroundWindow=lambda n: allowed.append((n, len(started)))))
real_ctypes = sys.modules.get("ctypes")
sys.modules["ctypes"] = ctypes

EXE = "C:\\Users\\Ada Lovelace\\AppData\\Local\\Octet Draw\\Octet Draw.exe"
files = {EXE: stat.S_IFREG | 0o755, "C:\\Octet\\folder.exe": stat.S_IFDIR | 0o755, "C:\\Octet\\linked.exe": stat.S_IFREG | 0o755, "C:\\Octet\\Run.bat": stat.S_IFREG | 0o755}


def lstat(path):
    if path not in files:
        raise FileNotFoundError(path)
    return types.SimpleNamespace(st_mode=files[path], st_file_attributes=0x400 if "linked" in path else 0x20)


for value, want in [
    ('"%s"' % EXE, EXE),
    (EXE, EXE),
    ("  " + EXE + "  ", EXE),
    ('"%s" -Embedding' % EXE, None),
    (EXE + " -Embedding", None),
    ("Octet Draw.exe", None),
    ("\\\\server\\share\\Octet Draw.exe", None),
    ("C:\\Octet\\..\\Windows\\notepad.exe", None),
    ("C:\\Octet\\.\\x.exe", None),
    ("C:\\Octet\\\\x.exe", None),
    ("C:/Octet/x.exe", None),
    ("C:\\Octet\\Run.bat", None),
    ("C:\\Octet\\gone.exe", None),
    ("C:\\Octet\\folder.exe", None),
    ("C:\\Octet\\linked.exe", None),
    ('"C:\\Octet\\x".exe', None),
    ("", None),
    ('""', None),
    (b"C:\\x.exe", None),
    (7, None),
]:
    assert od.server_program(value, lstat) == want, value
# The 64-bit view first, then the 32-bit one; REG_EXPAND_SZ and missing keys are passed over.
assert od.windows_octet(lstat) is None
registry[0x20019 | 0x200] = ('"%s"' % EXE, winreg.REG_SZ)
assert od.windows_octet(lstat) == EXE
registry[0x20019 | 0x100] = ("%LOCALAPPDATA%\\Octet Draw\\Octet Draw.exe", winreg.REG_EXPAND_SZ)
assert od.windows_octet(lstat) == EXE
registry[0x20019 | 0x100] = ("C:\\Octet\\gone.exe", winreg.REG_SZ)
assert od.windows_octet(lstat) == EXE, "a 64-bit value naming a program that is gone"
assert [k for _, k, _ in opened][-1] == "Software\\Classes\\CLSID\\{211EF98F-E45E-42C8-9D49-A10D2D394DB2}\\LocalServer32"
assert all(root == "HKCU" for root, _, _ in opened)

od.SYSTEM = "win32"
od.windows_octet = lambda lstat=lstat, real=od.windows_octet: real(lstat)
os.environ["PYTHONHOME"], os.environ["PYTHONPATH"] = "C:\\LibreOffice\\program\\python-core", "x"


def session(doc, shape=None, kind="pdf", at=None):
    return od.Session(None, Controller(doc), shape, kind, at)


s = session(Document(title='Report "final" \\ %PATH% ^&|<> \u202e\0.odt'), Picture(octet_emf), "emf")
assert os.path.basename(s.path) == "drawing.emf" and os.path.basename(s.folder).startswith("octet-libreoffice-")
assert os.path.dirname(s.folder) == tempfile.gettempdir(), "the user's own temporary folder"
started.clear()
od.start(s)
kind, args, options = started[0]
assert (kind, args) == ("popen", [EXE, "--object", s.path, "--app", "Writer", "--host", 'Report "final" \\ %PATH% ^&|<> \u202e.odt']), args
assert options["creationflags"] == 0x00000208 and options["stdin"] == subprocess.DEVNULL and "shell" not in options and options["close_fds"]
assert "PYTHONHOME" not in options["env"] and "PYTHONPATH" not in options["env"] and options["env"].get("PATH") == os.environ.get("PATH")
assert allowed == [(-1, 0)], "LibreOffice lets Octet come to the front before it starts it"
assert s in od.SESSIONS and os.path.isdir(s.folder)
with od.LOCK:
    od.SESSIONS.clear()
# Not found, or it does not start: the user hears it, and the folder goes.
registry.clear()
said.clear()
s = session(Document(), Picture(octet_emf), "emf")
od.start(s)
assert said == [NOT_FOUND] and not os.path.exists(s.folder) and not od.SESSIONS
registry[0x20019 | 0x100] = ('"%s"' % EXE, winreg.REG_SZ)
popen.fail = True
s = session(Document(), Picture(octet_emf), "emf")
od.start(s)
assert said == [NOT_FOUND] * 2 and not os.path.exists(s.folder)
popen.fail = False
# Insert > Octet Drawing on Windows asks for a PDF, as on the Mac and Linux: LibreOffice on Windows keeps a PDF's own
# bytes, where it converts a pasted EMF.
real_start, begun = od.start, []
od.start = begun.append
od.insert(None, Controller(Document("com.sun.star.presentation.PresentationDocument")))
od.start = real_start
assert os.path.basename(begun[0].path) == "drawing.pdf"
shutil.rmtree(begun[0].folder)
said.clear()
# The first double-click after LibreOffice starts removes the extension's folders that Octet closed (LibreOffice quit
# first), and nothing else: not one Octet may still update, a link, or another program's folder.
base = tempfile.gettempdir()
for name, files in [("octet-libreoffice-done", ["closed"]), ("octet-libreoffice-open", ["gone"]), ("octet-other", ["closed"]), ("target", ["closed", "keep"])]:
    os.mkdir(os.path.join(base, name))
    for f in files:
        open(os.path.join(base, name, f), "wb").close()
os.symlink(os.path.join(base, "target"), os.path.join(base, "octet-libreoffice-link"))
od.SWEPT.clear()
od.sweep()
mine = {"octet-libreoffice-done", "octet-libreoffice-open", "octet-other", "target", "octet-libreoffice-link"}
assert sorted(mine & set(os.listdir(base))) == ["octet-libreoffice-link", "octet-libreoffice-open", "octet-other", "target"], os.listdir(base)
assert os.path.exists(os.path.join(base, "target", "keep")), "never through a link"
os.mkdir(os.path.join(base, "octet-libreoffice-later"))
open(os.path.join(base, "octet-libreoffice-later", "closed"), "wb").close()
od.sweep()
assert os.path.isdir(os.path.join(base, "octet-libreoffice-later")), "once each time LibreOffice starts"
for name in ["octet-libreoffice-open", "octet-other", "target", "octet-libreoffice-later"]:
    shutil.rmtree(os.path.join(base, name))
os.unlink(os.path.join(base, "octet-libreoffice-link"))


# The command line: Python writes it by Microsoft's rules (list2cmdline), and Octet's Rust reads it back by them
# (std::env::args_os on Windows). Hostile names come back as they were.
def windows_args(line):
    # The program's own path: up to the closing quote, or the first space or tab. No escapes.
    if line.startswith('"'):
        end = line.index('"', 1)
        out, i = [line[1:end]], end + 1
    else:
        end = next((k for k, c in enumerate(line) if c in " \t"), len(line))
        out, i = [line[:end]], end
    cur, quoted, have = [], False, False
    while i < len(line):
        c = line[i]
        if c == "\\":
            n = 0
            while i < len(line) and line[i] == "\\":
                n, i = n + 1, i + 1
            if i < len(line) and line[i] == '"':
                cur.append("\\" * (n // 2))
                if n % 2:
                    cur.append('"')
                    i += 1
            else:
                cur.append("\\" * n)
            have = True
        elif c == '"':
            if quoted and i + 1 < len(line) and line[i + 1] == '"':
                cur.append('"')
                i += 2
            else:
                quoted, i, have = not quoted, i + 1, True
        elif c in " \t" and not quoted:
            if cur or have:
                out.append("".join(cur))
            cur, have, i = [], False, i + 1
        else:
            cur.append(c)
            i += 1
    if cur or have:
        out.append("".join(cur))
    return out


names = ['"', 'a"b', "end\\", "end\\\\", '\\"', '\\\\"', 'say "hi" \\', "%PATH%", "^&|<>()", "tab\there", "line\nend", "x" * 300, "\u202eright to left\u200f", "\U0001f9ea flask", "--convert", "--headless", "--object", "", " ", "Report final.odt", '"quoted name.odt"']
for name in names:
    title = name[:260]
    argv = [EXE] + od.arguments("C:\\Users\\Ada\\AppData\\Local\\Temp\\octet-libreoffice-x\\drawing.emf", "Writer", title)
    assert windows_args(subprocess.list2cmdline(argv)) == argv, repr(name)
assert windows_args('a "b c" d\\\\"e f"') == ["a", "b c", 'd\\e f'] and windows_args('a "x""y"') == ["a", 'x"y']


# ---- The Mac (J2, J3, S5, S6, S7) ----

od.SYSTEM = "darwin"
started.clear()
title = "Report\r\nfinal\u2028" + "\U0001f9ea" + "y" * 300
s = session(Document("com.sun.star.sheet.SpreadsheetDocument", title), Picture(pdf), "pdf")
assert oct(os.stat(s.folder).st_mode & 0o777) == "0o700" and os.path.dirname(s.folder) == tempfile.gettempdir()
od.start(s)
with open(os.path.join(s.folder, "object"), "rb") as f:
    marker = f.read()
assert marker == ("Calc\n" + "Report  final \U0001f9ea" + "y" * 245).encode("utf-8"), marker
assert oct(os.stat(os.path.join(s.folder, "object")).st_mode & 0o777) == "0o600"
assert started == [("run", ["/usr/bin/open", "-b", "io.github.samchemman.octet-draw", s.path], {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "timeout": 10})], started
# Ten fast double-clicks on the picture that is open: one session, and Octet asked to bring it to the front each
# time. `object` is written once.
for _ in range(10):
    assert od.edit(None, s.controller, s.shape)
assert len(od.SESSIONS) == 1 and len(started) == 11 and all(a == started[0] for a in started)
with open(os.path.join(s.folder, "object"), "rb") as f:
    assert f.read() == marker
with od.LOCK:
    od.SESSIONS.clear()
# Octet is not installed (open ends with 1), or the name cannot be written: the user hears it, and the folder goes.
run.code = 1
s = session(Document(), Picture(pdf), "pdf")
od.start(s)
assert said == [NOT_FOUND] and not os.path.exists(s.folder) and not od.SESSIONS
run.code = 0
said.clear()
s = session(Document(title="bad \udc80 name"), None, "pdf")
assert od.launch_mac(s.folder, s.path, "", "bad \udc80 name")
with open(os.path.join(s.folder, "object"), "rb") as f:
    assert f.read() == b"\nbad ? name", "no program, and a name Python cannot write as UTF-8"
os.rmdir(os.path.join(s.folder, "object")) if os.path.isdir(os.path.join(s.folder, "object")) else os.unlink(os.path.join(s.folder, "object"))
os.symlink(os.path.join(folder, "a.pdf"), os.path.join(s.folder, "object"))
assert od.launch_mac(s.folder, s.path, "Writer", "R"), "a link where object goes is never written through"
with open(os.path.join(folder, "a.pdf"), "rb") as f:
    assert f.read() == pdf


# ---- Linux: the arguments as in 1.1.2, now with Calc (J6) ----

od.SYSTEM = "linux"
for kind, program in od.DOCUMENTS:
    assert od.arguments("/run/x/drawing.pdf", program, "R.odt") == ["--object", "/run/x/drawing.pdf", "--app", program, "--host", "R.odt"]
assert od.arguments("/run/x/drawing.pdf", "", "R") == ["--object", "/run/x/drawing.pdf", "--host", "R"], "no --app"
assert [p for _, p in od.DOCUMENTS] == ["Writer", "Impress", "Draw", "Calc"]
started.clear()
od.octet = lambda: ["/usr/bin/octet"]
import shutil  # noqa: E402

shutil.which = lambda name: None
s = session(Document("com.sun.star.sheet.SpreadsheetDocument", "Sheet.ods"), Picture(pdf), "pdf")
od.start(s)
assert started[0][1] == ["/usr/bin/octet", "--object", s.path, "--app", "Calc", "--host", "Sheet.ods"] and started[0][2]["start_new_session"]
with od.LOCK:
    od.SESSIONS.clear()


# ---- Update: crop off, Undo puts it back; rotation, alt text kept (J7, S15) ----

def update(shape, data):
    s = session(Document(), shape, od.kind_of(data))
    s.put(data)
    return s


shape = Picture(octet_emf)
old_graphic, old_size, old_crop = shape.Graphic, shape.Size, shape.GraphicCrop
s = update(shape, octet_emf)
assert shape.Graphic.data == octet_emf and (shape.Size.Width, shape.Size.Height) == (2540, 1270)
assert (shape.GraphicCrop.Top, shape.GraphicCrop.Left, shape.GraphicCrop.struct) == (0, 0, "com.sun.star.text.GraphicCrop"), "the crop comes off"
assert (shape.RotateAngle, shape.Description) == (4500, "Aspirin"), "rotation and alt text stay"
assert s.doc.undo.locked == 0 and len(s.doc.undo.actions) == 1 and s.doc.undo.actions[0].Title == "Octet Drawing"
s.doc.undo.actions[0].undo()
assert (shape.Graphic, shape.Size, shape.GraphicCrop) == (old_graphic, old_size, old_crop), "Undo: the old picture, size and crop"
s.doc.undo.actions[0].redo()
assert shape.Graphic.data == octet_emf and shape.GraphicCrop.Top == 0
# A picture with no crop property takes the update all the same.
shape = Picture(pdf, crop=False)
s = update(shape, pdf)
assert shape.Graphic.data == pdf and not hasattr(shape, "GraphicCrop")
s.doc.undo.actions[0].undo()
assert not hasattr(shape, "GraphicCrop")
# A picture that went: the session is gone, and Octet hears it.
s = session(Document(), types.SimpleNamespace(), "pdf")
s.put(pdf)
assert s.gone and os.path.exists(os.path.join(s.folder, "gone"))


# ---- Insert: Impress, Draw and Calc through Insert > Image, from a private copy (J6, S25) ----

for kind in ["com.sun.star.presentation.PresentationDocument", "com.sun.star.drawing.DrawingDocument", "com.sun.star.sheet.SpreadsheetDocument"]:
    placed = Picture(None)
    doc = Document(kind)
    s = od.Session(None, Controller(doc, Shapes(placed)), None, "emf")
    dispatched.clear()
    s.put(octet_emf)
    assert s.shape is placed and not s.gone and doc.undo.contexts == ["Octet Drawing"], kind
    command, props = dispatched[0]
    assert command == ".uno:InsertGraphic" and props["AsLink"] is False and props["FileName"].endswith(".emf")
    assert not os.path.exists(props["FileName"][7:]), "the private copy goes"


# LibreOffice's Insert > Image, as its source does it. Impress and Draw (sd FuInsertGraphic, View::InsertGraphic) put
# the picture into one selected picture or fill one selected shape with it, else into an empty placeholder, else add it
# last, and select it. Calc (lcl_InsertGraphic) puts it into one selected shape, else adds it last and, for a command
# with a file name, does not select it (SdrInsertFlags::DONTMARK).
class Page:
    def __init__(self, *shapes):
        self.shapes = list(shapes)

    def getCount(self):
        return len(self.shapes)

    def getByIndex(self, k):
        return self.shapes[k]


class Selection(Shapes):
    def supportsService(self, name):
        return name == "com.sun.star.drawing.ShapeCollection"


class Office(Controller):
    def __init__(self, doc, page, selection=None, placeholder=None):
        Controller.__init__(self, doc, selection)
        self.page, self.placeholder, self.cleared = page, placeholder, 0
        calc = doc.kind == "com.sun.star.sheet.SpreadsheetDocument"
        self.getActiveSheet = lambda: types.SimpleNamespace(getDrawPage=lambda: page) if calc else None
        if not calc:
            self.getCurrentPage = lambda: page

    def select(self, what):
        assert what is None
        self.cleared += 1
        self.selection = None

    def inserted(self):
        new = Picture(None)
        one = self.selection.getByIndex(0) if self.selection and self.selection.getCount() == 1 else None
        if one is not None:
            # In place of the selected picture, or as the selected shape's fill: the user's own shape changes.
            one.Graphic = "Octet's drawing"
            return
        if self.placeholder in self.page.shapes:
            self.page.shapes[self.page.shapes.index(self.placeholder)] = new
        else:
            self.page.shapes.append(new)
        if self.doc.kind != "com.sun.star.sheet.SpreadsheetDocument":
            self.selection = Shapes(new)


Dispatcher.executeDispatch = lambda self, frame, command, target, flags, props: dispatched.append((command, {p.Name: p.Value for p in props})) or office.inserted()
for kind in ["com.sun.star.presentation.PresentationDocument", "com.sun.star.drawing.DrawingDocument", "com.sun.star.sheet.SpreadsheetDocument"]:
    # Nothing selected; the user's own picture, selected; a text box being edited (Impress and Draw).
    for selected in [None, "picture", "text"]:
        if selected == "text" and kind.endswith("SpreadsheetDocument"):
            continue
        mine, other = Picture(pdf), Picture(None, service="com.sun.star.drawing.TextShape")
        kept = mine.Graphic
        page = Page(mine, other)
        selection = Selection(mine) if selected == "picture" else Shapes(other) if selected == "text" else None
        office = Office(Document(kind), page, selection)
        s = od.Session(None, office, None, "pdf")
        dispatched.clear()
        s.put(pdf)
        assert s.shape is page.shapes[-1] and len(page.shapes) == 3 and not s.gone, (kind, selected)
        assert mine.Graphic is kept and other.Graphic is None, "the user's shapes stay as they were"
        assert office.cleared == (0 if kind.endswith("SpreadsheetDocument") and selected is None else 1), (kind, selected, office.cleared)
        # The next Update changes that picture: it adds no second one.
        s.put(octet_emf)
        assert len(page.shapes) == 3 and len(dispatched) == 1 and s.shape.Graphic.data == octet_emf, (kind, selected)
    # An empty placeholder on the slide (Impress): the picture takes its place.
    if not kind.endswith("SpreadsheetDocument"):
        holder = Picture(None, service="com.sun.star.presentation.GraphicObjectShape")
        page = Page(Picture(pdf), holder, Picture(pdf))
        office = Office(Document(kind), page, None, holder)
        office.inserted = lambda real=office.inserted: real() or setattr(office, "selection", None)
        s = od.Session(None, office, None, "pdf")
        s.put(pdf)
        assert s.shape is page.shapes[1] and holder not in page.shapes and len(page.shapes) == 3, kind
        # An empty text box being edited goes when the edit ends, so the pictures after it move up a place.
        empty, later = Picture(None, service="com.sun.star.drawing.TextShape"), Picture(pdf)
        page = Page(Picture(pdf), empty, later)
        office = Office(Document(kind), page)
        office.inserted = lambda real=office.inserted: page.shapes.remove(empty) or real()
        s = od.Session(None, office, None, "pdf")
        s.put(pdf)
        assert s.shape is page.shapes[-1] and s.shape is not later and len(page.shapes) == 3, kind
Dispatcher.executeDispatch = lambda self, frame, command, target, flags, props: dispatched.append((command, {p.Name: p.Value for p in props}))
dispatched.clear()
# On Windows LibreOffice can still hold the copy: it stays, and the drawing goes on.
unlink = os.unlink


def held(path):
    raise PermissionError(13, "in use", path)


os.unlink = held
s = od.Session(None, Controller(Document("com.sun.star.sheet.SpreadsheetDocument"), Shapes(Picture(None))), None, "pdf")
dispatched.clear()
s.put(pdf)
os.unlink = unlink
copy = dispatched[0][1]["FileName"][7:]
assert s.shape is not None and not s.gone and os.path.exists(copy)
os.unlink(copy)


# ---- The watch: each new picture once; one that cannot be read now is read at the next look (S9) ----

put = []
od.on_main = lambda ctx, f: f()
s = session(Document(), Picture(pdf), "pdf")
s.put = lambda data: put.append(data)
with od.LOCK:
    od.SESSIONS.append(s)
with open(s.path, "wb") as f:
    f.write(pdf)
real_read = od.read_picture
od.read_picture = lambda p: (False, None)
od.look(s)
assert put == [] and s.seen is None, "busy: looked at again"
od.read_picture = real_read
od.look(s)
od.look(s)
assert put == [pdf], "read once"
os.replace(os.path.join(folder, "b.emf"), s.path + ".new")
os.replace(s.path + ".new", s.path)
od.look(s)
assert put == [pdf, octet_emf], "Update renames a new file over it"
with open(s.path, "wb") as f:
    f.write(b"not a picture at all")
od.look(s)
od.look(s)
assert put == [pdf, octet_emf] and s.seen == od.stamp(s.path), "a file that is no picture is passed over once"
open(os.path.join(s.folder, "closed"), "w").close()
od.look(s)
assert not od.SESSIONS and not os.path.exists(s.folder), "Octet's window closed: the folder goes"


# ---- Read-only documents (J7, S14) ----

read_only = Controller(Document(readonly=True), Shapes(Picture(octet_emf)))
calls = []
real_edit = od.edit
od.edit = lambda *a: calls.append(a) or True
click = types.SimpleNamespace(ClickCount=2, Buttons=1)
assert od.Clicks(None, read_only).mousePressed(click) is False and not calls, "LibreOffice keeps its own double-click"
assert od.Clicks(None, Controller(Document(), Shapes(Picture(octet_emf)))).mousePressed(click) is True and len(calls) == 1
od.edit = real_edit
menu = types.SimpleNamespace(Selection=read_only, ActionTriggerContainer=None)
assert od.Menu(None).notifyContextMenuExecute(menu) == ("com.sun.star.ui.ContextMenuInterceptorAction", "IGNORED")
before = set(os.listdir(tempfile.gettempdir()))
said.clear()
od.insert(None, read_only)
assert said == ["This document is read-only."] and set(os.listdir(tempfile.gettempdir())) == before, "no session, no folder"
# A Calc sheet's picture is selected as a shape, as in Impress and Draw.
assert od.selected_picture(Controller(Document("com.sun.star.sheet.SpreadsheetDocument"), Shapes(Picture(pdf)))) is not None

shutil.rmtree(folder)
if real_ctypes is not None:
    sys.modules["ctypes"] = real_ctypes


# ---- Timing: the double-click check on a 64 MB picture with no drawing, median of 5 (section 8, S19) ----

def median(f, data):
    times = []
    for _ in range(5):
        t = time.perf_counter()
        assert f(data) is False
        times.append(time.perf_counter() - t)
    return sorted(times)[2] * 1000


big_pdf = b"%PDF-1.7\n" + b"0" * (od.MAX_BYTES - 9)
big_emf = emf(*[record(17, b"\0" * 4)] * 63) + b"\0" * (od.MAX_BYTES - 108 - 63 * 12)
print(json.dumps({"pdf_ms": round(median(od.has_drawing, big_pdf), 2), "emf_ms": round(median(od.has_drawing, big_emf), 3)}))
