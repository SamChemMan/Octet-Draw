// Run: node scripts/examples/run-all.mjs OUT, with OCTET set as for the examples. Runs the scripting page's four
// examples (docs/scripting.md) in JavaScript and in Python against that program, on files made in OUT through the
// program itself: two schemes (one .cdxml, one .oct), a drawing with one number on two structures, and a CSV of
// SMILES with a row Octet cannot read. One line an example, and both outputs on a difference. The exit code is 1 when
// the two languages print different lines, end with different codes or write different files, or an example prints
// nothing. Each run (command, exit code, output) is in OUT/runs.json. For the checks (src/headless.check.ts) and for
// Windows and Linux (.github/workflows/platforms.yml).
import { execFile, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { octet } from "./octet.mjs";

const out = process.argv[2], at = (...p) => join(out, ...p), csv = at("table.csv"), run = promisify(execFile);
// python3 on the Mac and Linux, python or py -3 on Windows (where python3 can be the Store's stand-in, which fails).
const python = [["python3"], ["python"], ["py", "-3"]].find(([exe, ...a]) => /^Python 3/.test(spawnSync(exe, [...a, "--version"], { encoding: "utf8" }).stdout ?? ""));
console.log(`Octet: ${process.env.OCTET}\nPython: ${python?.join(" ") ?? "none"}`);
if (!python) process.exit(1);

// The files, drawn and saved by the program the examples run against. A program that cannot write .oct (the checks'
// Octet with no window) saves the second scheme as .cdxml, and says so.
mkdirSync(at("in"), { recursive: true });
const o = octet(), make = async (file, args) => {
  await o.call("drawings", { action: "new", for: "paper" });
  await o.call("draw", args);
  try { await o.save(file); return file; } catch (e) { if (!file.endsWith(".oct")) throw e; console.log(`${basename(file)}: ${e.message} Saved as .cdxml.`); }
  await o.save(file = file.replace(/\.oct$/, ".cdxml"));
  return file;
};
await o.call("set_brief", { destination: { kind: "paper" } });
const schemes = [
  await make(at("in", "scheme1.cdxml"), { lines: "benzaldehyde (7)\n-> [O-][N+](=O)/C=C/c1ccccc1 (3), MeNO2, NH4OAc\n-> 2-phenylethylamine (9), LiAlH4, THF" }),
  await make(at("in", "scheme2.oct"), { lines: "2-phenylethylamine (9)\n-> N-(2-phenylethyl)acetamide (4), Ac2O, Et3N" }),
];
await make(at("five.cdxml"), { structures: [{ text: "benzene", number: "5" }, { text: "toluene", number: "5" }] });
await o.close();
writeFileSync(csv, 'number,name,smiles\n1,benzene,c1ccccc1\n2,"2,4-dinitrophenol",Oc1ccc(cc1[N+](=O)[O-])[N+](=O)[O-]\n3,broken,C1CC(\n4,ethanol,CCO\n');

// Each example in turn in one language, in OUT/mjs or OUT/py: its command, exit code and output. Python writes a pipe
// in the system's code page on Windows (a console shows UTF-8), and ends its lines with CRLF there: both are made as
// Node's here.
const examples = async (x, [exe, ...a]) => {
  const runs = [];
  for (const [name, ...args] of [
    ["renumber", at(x, "renumbered"), ...schemes],
    ["restyle", "Angewandte", "1", at("in"), at(x, "restyled")],
    ["table", csv, at(x, "table"), "cdxml"],
    ["check", schemes[0], at(x, "renumbered", basename(schemes[1])), at("five.cdxml"), csv],
  ]) {
    const command = [exe, ...a, fileURLToPath(new URL(`${name}.${x}`, import.meta.url)), ...args];
    const r = await run(command[0], command.slice(1), { env: { ...process.env, PYTHONIOENCODING: "utf-8" }, timeout: 300_000 }).then((r) => ({ ...r, code: 0 }), (e) => e);
    runs.push({ name, command: command.join(" "), code: r.code, stdout: r.stdout.replaceAll("\r\n", "\n"), stderr: r.stderr.replaceAll("\r\n", "\n") });
  }
  return runs;
};
const [mjs, py] = await Promise.all([examples("mjs", [process.execPath]), examples("py", python)]);
writeFileSync(at("runs.json"), JSON.stringify({ mjs, py }, null, 1));

// The files each language wrote, and their bytes.
const files = (x) => new Map(readdirSync(at(x), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => [relative(at(x), join(e.parentPath, e.name)), readFileSync(join(e.parentPath, e.name))]));
const [jf, pf] = [files("mjs"), files("py")];
let failed = 0;
mjs.forEach((j, k) => {
  const p = py[k], same = j.stdout === p.stdout && j.code === p.code && j.stdout !== "";
  console.log(`${j.name}: ${same ? `the same in both (exit ${j.code})` : "different"}`);
  if (!same) for (const r of [j, p]) console.log(`  ${r.command}\n  exit ${r.code}\n${r.stdout}${r.stderr}`);
  failed += !same;
});
const differ = [...new Set([...jf.keys(), ...pf.keys()])].filter((f) => !(jf.has(f) && pf.has(f) && jf.get(f).equals(pf.get(f))));
console.log(differ.length ? `Files that differ or are in one language only: ${differ.sort().join(", ")}` : `Files: the same ${jf.size} in both`);
process.exitCode = failed || differ.length ? 1 : 0;
