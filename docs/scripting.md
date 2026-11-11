# Scripting Octet Draw

A script can use Octet Draw with no window. The script starts Octet, sends it tool calls and reads the replies. These
are the tools that AI apps use, and the script reads and writes the files itself.

You can write the script in any language. This page gives a client and four examples in Python and in JavaScript
(Node). You do not need to install a package.

## Where the program is

Set the environment variable `OCTET` to the path of the program:

| Platform | Program |
|---|---|
| Mac | `/Applications/Octet Draw.app/Contents/MacOS/octet` |
| Windows | `%LOCALAPPDATA%\Octet Draw\octet.exe` |
| Linux (`.deb` or `.rpm`) | `/usr/bin/octet` |
| Linux (AppImage) | The AppImage file, for example `~/Applications/Octet-Draw-linux.AppImage` |

On a Mac or Linux:

```
export OCTET="/Applications/Octet Draw.app/Contents/MacOS/octet"
```

On Windows, in PowerShell:

```
$env:OCTET = "$env:LOCALAPPDATA\Octet Draw\octet.exe"
```

Octet does not put an `octet` command on the path. To type `octet` in place of the path, make an alias. Put it in your
shell profile to keep it.

```
alias octet="/Applications/Octet Draw.app/Contents/MacOS/octet"
```

```
Set-Alias octet "$env:LOCALAPPDATA\Octet Draw\octet.exe"
```

## How it works

- `octet --headless --mcp` starts Octet with no window, no Dock icon and no network port.
- Octet reads one JSON-RPC message a line on standard input. It writes one message a line on standard output.
- Send `initialize` first. Then send `tools/call` for each tool call.
- To stop Octet, close its standard input. Octet completes the calls in progress, then stops.
- Octet Draw does not have to be open. Settings > General > AI apps > Let AI apps use Octet can be off.
- Each call that changes the drawing is one step that Undo can take away (`advanced` with `run_command` and `undo`).

To work in the drawing that is open in Octet, start the program with `--mcp` and no `--headless`. Octet must be open,
with Let AI apps use Octet on.

## The client

The client starts Octet, sends `initialize`, and gives you four functions:

- `call(tool, args)` calls a tool. It gives the result's data, or its text when there is no data. If Octet refuses
  the call, it raises an error with Octet's reason.
- `open(path)` opens a file in a new drawing. The calls that follow go to that drawing.
- `save(path, format)` writes the drawing to a file. The format is the file's extension when you do not give one.
- `close()` stops Octet.

Put the client in the same folder as your script.

### octet.py

```python
# Octet Draw for a script (docs/scripting.md): starts Octet with no window and calls its tools. Nothing to install.
# The program is OCTET, or the path given. open and save read and write the files: Octet's tools take no path.
import base64, json, os
from subprocess import PIPE, Popen

BINARY = ["cdx", "pdf", "png", "emf", "eps", "tif", "jpg", "gif"]  # read gives these in base64

class Octet:
    def __init__(self, program=None):
        command = [program or os.environ["OCTET"], "--headless", "--mcp"]
        self.p, self.n = Popen(command, stdin=PIPE, stdout=PIPE, encoding="utf-8", bufsize=1), 0
        self.send("initialize", {"protocolVersion": "2025-11-25", "capabilities": {},
                                 "clientInfo": {"name": "script", "version": "1"}})
    def send(self, method, params):  # one request a line; the reply's result, or Octet's reason as an error
        self.n += 1
        self.p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params}) + "\n")
        replies = (m for m in map(json.loads, self.p.stdout) if m.get("id") == self.n)
        m = next(replies, {"error": {"message": "Octet ended."}})
        if "error" in m: raise RuntimeError(m["error"]["message"])
        if m["result"].get("isError"): raise RuntimeError(m["result"]["content"][0]["text"])
        return m["result"]
    def call(self, tool, args={}):
        result = self.send("tools/call", {"name": tool, "arguments": args})
        return result.get("structuredContent", result["content"][0]["text"])
    def open(self, path):
        data = open(path, "rb").read()
        text = base64.b64encode(data).decode() if path.lower().endswith(".cdx") else data.decode("utf-8")
        return self.call("drawings", {"action": "new", "text": text})
    def save(self, path, format=None):
        format = format or path.rsplit(".", 1)[-1].lower()
        text = self.call("read", {"format": format})["text"]
        open(path, "wb").write(base64.b64decode(text) if format in BINARY else text.encode("utf-8"))
    def close(self):
        self.p.stdin.close()
        self.p.wait()
```

### octet.mjs

```js
// Octet Draw for a script (docs/scripting.md): starts Octet with no window and calls its tools. Nothing to install.
// The program is OCTET, or the path given. open and save read and write the files: Octet's tools take no path.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const BINARY = ["cdx", "pdf", "png", "emf", "eps", "tif", "jpg", "gif"]; // read gives these in base64
export function octet(program = process.env.OCTET) {
  const p = spawn(program, ["--headless", "--mcp"], { stdio: ["pipe", "pipe", "inherit"] }), waiting = new Map();
  let n = 0;
  // One request a line, and its reply a line with the same id.
  createInterface({ input: p.stdout }).on("line", (line) => {
    const m = JSON.parse(line);
    waiting.get(m.id)?.(m);
    waiting.delete(m.id);
  });
  p.on("exit", () => waiting.forEach((done) => done({ error: { message: "Octet ended." } })));
  const send = (method, params) => new Promise((done) => {
    waiting.set(++n, done);
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
  const hello = send("initialize", {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "script", version: "1" } });
  const call = async (tool, args = {}) => {
    await hello;
    const m = await send("tools/call", { name: tool, arguments: args });
    if (m.error || m.result.isError) throw new Error(m.error?.message ?? m.result.content[0].text);
    return m.result.structuredContent ?? m.result.content[0].text;
  };
  const ext = (f) => f.split(".").pop().toLowerCase();
  const open = (f) => call("drawings", { action: "new", text: readFileSync(f, ext(f) === "cdx" ? "base64" : "utf8") });
  const save = async (f, format = ext(f)) =>
    writeFileSync(f, (await call("read", { format })).text, BINARY.includes(format) ? "base64" : "utf8");
  const close = () => new Promise((done) => { p.on("exit", done); p.stdin.end(); if (p.exitCode !== null) done(); });
  return { call, open, save, close };
}
```

## The tools

| Tool | What it does |
|---|---|
| `draw` | Draws new work in one call: structures, a reaction, a scheme, a route, a grid or a catalytic cycle, written as lines |
| `change` | Changes the drawing with a list of operations: `draw`, `edit`, `replace`, `number`, `delete`, `move`, `arrange`, `text`, `arrow`, `shape`, `select`, `set_style`, `place_template`, `add_file` and `fill_experiment` |
| `read` | Reads the drawing: its structures, numbers, reactions, warnings and layout check. With `format`, it gives the drawing as a file |
| `drawings` | Lists the open drawings, uses one, or opens a new one. With `text`, the new drawing opens a file's text |
| `advanced` | Gives Octet's other tools: `run_command`, `set_style`, `place_template`, `add_file`, `fill_experiment`, `draw_route` and `help`. `export` opens Octet's Export dialog, so Octet refuses it with no window: use `read` with `format` |
| `set_brief` | Sets the style and page: a journal and its column, a page size, or the style of a drawing |

To get the arguments of a tool or an operation, call `advanced` with `help`:

```
call("advanced", {"tool": "help", "args": {"of": "number"}})
```

## Files

Octet's tools take no path. The script reads and writes each file.

- To open a file, read its bytes and give them to `drawings` with `action: "new"` and `text`. Octet opens CDXML,
  CDX, `.oct`, MOL, SDF, RXN, CML, SMILES and InChI. Give CDX in base64 and the other formats as text. The limit is
  1,000,000 characters.
- To save a file, call `read` with `format`. Octet gives every format that Export writes. It gives CDX, PDF, PNG,
  EMF, EPS, TIFF, JPEG and GIF in base64, and the other formats as text.
- A picture takes Export's options: `width_mm`, `dpi` and `transparent`.

A scheme, route, figure, cycle or grid needs the brief before Octet draws it. A script sets the brief itself, with
`set_brief` or with `brief` in `draw`. Octet does not ask a script questions.

## Example 1: renumber the compounds of a review

This script opens the schemes of a review in order. It gives the numbered compounds the numbers 1, 2, 3 and on, in
the order they first come. A compound in two schemes gets the same number. The script saves each scheme in a folder.

The script changes only the number under each structure. It does not change a number in the conditions or in other
text, for example "3 (1.2 equiv)" or "from 7". Check those numbers yourself.

```
python3 renumber.py renumbered scheme1.cdxml scheme2.oct
```

```
scheme1.cdxml: 7 is 1, 3 is 2, 9 is 3
scheme2.oct: 9 is 3, 4 is 4
```

### renumber.py

```python
# Renumbers the compounds across the schemes of a review in the order they first come: scheme by scheme, row by row
# from the top, left to right. A compound drawn again gets its first number. Each drawing is saved in OUT.
# Run: python3 renumber.py OUT scheme1.cdxml scheme2.oct ...
import os, sys
from octet import Octet

out, files, o, numbers = sys.argv[1], sys.argv[2:], Octet(), {}
os.makedirs(out, exist_ok=True)

# Rows from the top (a structure whose middle is above the bottom of the row's highest one is in that row), each left
# to right. A box is [left, bottom, right, top].
def in_order(structures):
    rows = []
    for s in sorted(structures, key=lambda s: -s["box"][3]):
        if rows and (s["box"][1] + s["box"][3]) / 2 > rows[-1][0]["box"][1]: rows[-1].append(s)
        else: rows.append([s])
    return [s for row in rows for s in sorted(row, key=lambda s: s["box"][0])]

for file in files:
    o.open(file)
    numbered = in_order([s for s in o.call("read", {"detail": "full"})["structures"] if s.get("number")])
    operations = []
    for s in numbered:
        key = s.get("inchiKey") or s.get("smiles") or f"{file} {s['id']}"
        numbers.setdefault(key, str(len(numbers) + 1))
        operations.append({"op": "number", "structure": s["id"], "number": numbers[key]})
    if operations: o.call("change", {"operations": operations})
    o.save(os.path.join(out, os.path.basename(file)))
    renumbered = ", ".join(f"{s['number']} is {op['number']}" for s, op in zip(numbered, operations))
    print(f"{os.path.basename(file)}: {renumbered}")
o.close()
```

### renumber.mjs

```js
// Renumbers the compounds across the schemes of a review in the order they first come: scheme by scheme, row by row
// from the top, left to right. A compound drawn again gets its first number. Each drawing is saved in OUT.
// Run: node renumber.mjs OUT scheme1.cdxml scheme2.oct ...
import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { octet } from "./octet.mjs";

const [out, ...files] = process.argv.slice(2), o = octet(), numbers = new Map();
mkdirSync(out, { recursive: true });
// Rows from the top (a structure whose middle is above the bottom of the row's highest one is in that row), each left
// to right. A box is [left, bottom, right, top].
const inOrder = (structures) => {
  const rows = [], middle = (s) => (s.box[1] + s.box[3]) / 2;
  for (const s of [...structures].sort((p, q) => q.box[3] - p.box[3])) {
    if (rows.length && middle(s) > rows.at(-1)[0].box[1]) rows.at(-1).push(s); else rows.push([s]);
  }
  return rows.flatMap((row) => row.sort((p, q) => p.box[0] - q.box[0]));
};
for (const file of files) {
  await o.open(file);
  const numbered = inOrder((await o.call("read", { detail: "full" })).structures.filter((s) => s.number));
  const operations = numbered.map((s) => {
    const key = s.inchiKey ?? s.smiles ?? `${file} ${s.id}`;
    if (!numbers.has(key)) numbers.set(key, String(numbers.size + 1));
    return { op: "number", structure: s.id, number: numbers.get(key) };
  });
  if (operations.length) await o.call("change", { operations });
  await o.save(join(out, basename(file)));
  console.log(`${basename(file)}: ${numbered.map((s, k) => `${s.number} is ${operations[k].number}`).join(", ")}`);
}
await o.close();
```

## Example 2: apply a journal's style to a folder of figures

This script gives each drawing in a folder the style of a journal, on a page as wide as one or two of its columns.
It saves each drawing in a folder, and tells you which figures do not fit the page.

```
python3 restyle.py Angewandte 1 figures restyled
```

### restyle.py

```python
# Applies a journal's style to every figure in a folder: each drawing gets the journal's preset and its column's page,
# as set_brief gives them, and is saved in OUT. A figure that does not fit the page is named with what is off it.
# Run: python3 restyle.py JOURNAL COLUMNS FOLDER OUT   (for example: python3 restyle.py Angewandte 1 figures restyled)
import json, os, sys
from octet import Octet

journal, columns, folder, out = sys.argv[1:5]
o = Octet()
os.makedirs(out, exist_ok=True)
for name in sorted(f for f in os.listdir(folder) if f.lower().endswith((".cdxml", ".cdx", ".oct"))):
    o.open(os.path.join(folder, name))
    o.call("set_brief", {"destination": {"kind": "paper", "journal": journal, "columns": int(columns)}})
    read = o.call("read")
    o.save(os.path.join(out, name))
    check = "" if read["check"] == "clean" else f", check {json.dumps(read['check'], separators=(',', ':'))}"
    print(f"{name}: {read['style']}{check}")
o.close()
```

### restyle.mjs

```js
// Applies a journal's style to every figure in a folder: each drawing gets the journal's preset and its column's page,
// as set_brief gives them, and is saved in OUT. A figure that does not fit the page is named with what is off it.
// Run: node restyle.mjs JOURNAL COLUMNS FOLDER OUT   (for example: node restyle.mjs Angewandte 1 figures restyled)
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { octet } from "./octet.mjs";

const [journal, columns, folder, out] = process.argv.slice(2), o = octet();
mkdirSync(out, { recursive: true });
for (const name of readdirSync(folder).filter((f) => /\.(cdxml|cdx|oct)$/i.test(f)).sort()) {
  await o.open(join(folder, name));
  await o.call("set_brief", { destination: { kind: "paper", journal, columns: Number(columns) } });
  const { style, check } = await o.call("read");
  await o.save(join(out, name));
  console.log(`${name}: ${style}${check === "clean" ? "" : `, check ${JSON.stringify(check)}`}`);
}
await o.close();
```

## Example 3: one drawing for each row of a table

This script reads a CSV file with the columns `number`, `name` and `smiles`. It draws each row with its number and
name under the structure, and saves it as an SVG file. Give a different format as the third argument. If Octet
cannot read the SMILES of a row, the script gives the row's number and the reason, and goes on to the next row. The
exit code is then 1.

```
number,name,smiles
1,benzene,c1ccccc1
2,"2,4-dinitrophenol",Oc1ccc(cc1[N+](=O)[O-])[N+](=O)[O-]
```

```
python3 table.py compounds.csv drawings pdf
```

### table.py

```python
# One drawing a row of a table: a CSV with the columns number, name and smiles, and a first row of headings. Each row
# is drawn with its number under it and its name under that, and saved in OUT as NUMBER.svg (or the format given:
# oct, cdxml, pdf, png and the rest). Undo takes each row away once it is saved, so Octet keeps one drawing open.
# A row Octet cannot draw is named with the reason, and the exit code is 1.
# Run: python3 table.py compounds.csv OUT [svg]
import csv, os, sys
from octet import Octet

table, out, format = sys.argv[1], sys.argv[2], (sys.argv[3:] or ["svg"])[0]
o, failed = Octet(), 0
os.makedirs(out, exist_ok=True)
with open(table, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        try:
            o.call("draw", {"structures": [{"text": row["smiles"], "number": row["number"], "caption": row["name"]}]})
            o.save(os.path.join(out, f"{row['number']}.{format}"), format)
            o.call("advanced", {"tool": "run_command", "args": {"command": "undo"}})
            print(f"{row['number']}.{format}: {row['name']}")
        except RuntimeError as e:
            print(f"{row['number']}: {e}")
            failed += 1
o.close()
sys.exit(1 if failed else 0)
```

### table.mjs

```js
// One drawing a row of a table: a CSV with the columns number, name and smiles, and a first row of headings. Each row
// is drawn with its number under it and its name under that, and saved in OUT as NUMBER.svg (or the format given:
// oct, cdxml, pdf, png and the rest). Undo takes each row away once it is saved, so Octet keeps one drawing open.
// A row Octet cannot draw is named with the reason, and the exit code is 1.
// Run: node table.mjs compounds.csv OUT [svg]
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { octet } from "./octet.mjs";

const [csv, out, format = "svg"] = process.argv.slice(2), o = octet();
// A line's cells. A cell in quotes can hold commas ("2,4-dinitrophenol").
const cells = (line) => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map((m) => m[1].replace(/^"(.*)"$/, "$1"))
  .map((cell) => cell.replaceAll('""', '"'));
let failed = 0;
mkdirSync(out, { recursive: true });
for (const line of readFileSync(csv, "utf8").split(/\r?\n/).slice(1).filter((l) => l.trim())) {
  const [number, name, smiles] = cells(line);
  try {
    await o.call("draw", { structures: [{ text: smiles, number, caption: name }] });
    await o.save(join(out, `${number}.${format}`), format);
    await o.call("advanced", { tool: "run_command", args: { command: "undo" } });
    console.log(`${number}.${format}: ${name}`);
  } catch (e) { console.log(`${number}: ${e.message}`); failed++; }
}
await o.close();
process.exitCode = failed ? 1 : 0;
```

## Example 4: check each structure in a manuscript

This script opens each drawing of a manuscript and prints Octet's warnings and layout check for it. The exit code is
1 when there is something to look at.

```
python3 check.py scheme1.cdxml scheme2.oct figure3.oct
```

```
scheme1.cdxml: clean
scheme2.oct: clean
figure3.oct: 1 to look at
  s1.1 C1 has 5 bonds. Carbon has a maximum of 4. Remove a bond.
1 to look at.
```

### check.py

```python
# Checks every structure in a manuscript's drawings: Octet's warnings (valence, stereo, a number on two structures)
# and its layout check (overlaps, off the page), one line each, then the count. The exit code is 1 when there is one.
# Run: python3 check.py scheme1.cdxml figure2.oct ...
import os, sys
from octet import Octet

o, found = Octet(), 0
for file in sys.argv[1:]:
    try: o.open(file)
    except (OSError, RuntimeError) as e:
        print(f"{os.path.basename(file)}: {e}")
        found += 1
        continue
    warnings = o.call("read", {"detail": "full"})["warnings"]
    print(f"{os.path.basename(file)}: " + (f"{len(warnings)} to look at" if warnings else "clean"))
    for w in warnings:
        label = w.get("atom") or w.get("structure") or " and ".join(w.get("ids", []))
        print(f"  {label + ' ' if label else ''}{w['message']}")
    found += len(warnings)
print(f"{found} to look at.")
o.close()
sys.exit(1 if found else 0)
```

### check.mjs

```js
// Checks every structure in a manuscript's drawings: Octet's warnings (valence, stereo, a number on two structures)
// and its layout check (overlaps, off the page), one line each, then the count. The exit code is 1 when there is one.
// Run: node check.mjs scheme1.cdxml figure2.oct ...
import { basename } from "node:path";
import { octet } from "./octet.mjs";

const o = octet();
let found = 0;
for (const file of process.argv.slice(2)) {
  try { await o.open(file); } catch (e) { console.log(`${basename(file)}: ${e.message}`); found++; continue; }
  const { warnings } = await o.call("read", { detail: "full" });
  console.log(`${basename(file)}: ${warnings.length ? `${warnings.length} to look at` : "clean"}`);
  for (const w of warnings) {
    const label = w.atom ?? w.structure ?? w.ids?.join(" and ");
    console.log(`  ${label ? `${label} ` : ""}${w.message}`);
  }
  found += warnings.length;
}
console.log(`${found} to look at.`);
await o.close();
process.exitCode = found ? 1 : 0;
```

## Convert many files

To convert files with no script, use `--convert`:

```
octet --convert figures --to pdf --out pdfs --width 89mm
```

```
scheme1.cdxml -> scheme1.pdf
scheme2.oct -> scheme2.pdf
Converted 2 of 2 files.
```

- Give files, folders or both. Add `--recursive` to include the folders in a folder.
- `--to` takes every format that Export or Save writes. `--to sdf --each` writes one SDF file for each drawing,
  with each compound and its number.
- `--out` is the folder for the new files. Without it, each file goes next to its input.
- `--width` and `--dpi` are Export's options. `--style` applies a journal's style, or the style of a CDXML or `.oct`
  file, before Octet converts.
- Octet does not write over a file. It adds a number to the new name. Add `--overwrite` to write over files.
- If Octet cannot read a file, it gives the reason, converts the other files, and the exit code is 1.

## What a script cannot do

- A script cannot give Octet a path. Octet does not read or write files for a script.
- A script cannot close a drawing. Each file that a script opens stays open until the script stops Octet. For a
  very large folder, stop Octet and start it again after each part of the folder, or use `--convert`.
- A script cannot use a dialog. Octet refuses Export, Document Settings and the other commands that open a dialog.
  Use `read` with `format`, and `set_brief` or `advanced` with `set_style`.
- A script cannot open a file of more than 1,000,000 characters. Use `--convert` for a larger file.
