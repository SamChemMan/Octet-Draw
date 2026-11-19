// Run: node src/changedby.check.ts. Fails loudly if Last changed by (issue 100, docs/plans/issue-100-100-1-1-3.md)
// stops being set by a save only, stops being ChemDraw's ModificationUserName in CDXML (the root) and CDX (tag 0x0004),
// stops coming back through .oct, goes where it does not belong (a copy, an own template, Settings' fields), or if
// Home's tiles stop showing the drawing's title and author.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { CHANGED_BY, COMMENT, PROPERTIES, changedBy, detailsOf, stamped, templateOf, withDetails } from "./experiment.ts";
import { fromCdxml, parseXml, toCdxml } from "./cdxml.ts";
import { cdxToXml, xmlToCdx } from "./cdx.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { readStore, setAbout, writeStore } from "./projects.ts";
import type { Mol } from "./render.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const C = { label: "C", location: [0, 0, 0] as [number, number, number] };
const props = { title: "Aspirin, route 2", author: "Zoë Ångström", comment: "Two\nlines" };
const drawing = (): Mol => ({ atoms: [C], bonds: [], annotations: withDetails([{ keyword: "GUID", content: "1" }], props, PROPERTIES) });

// stamped: the name as one line, the same drawing when nothing changes or there is no name (stress 13, 25, 26).
{
  const m = drawing(), s = stamped(m, "Sam Ellis");
  assert.equal(changedBy(m.annotations), undefined, "a drawing never saved has none");
  assert.equal(changedBy(s.annotations), "Sam Ellis");
  assert.equal(stamped(s, "Sam Ellis"), s, "the same name: the same drawing");
  assert.equal(stamped(m, ""), m, "no name: the same drawing");
  assert.equal(stamped(m, " \n\t "), m);
  assert.equal(changedBy(stamped(s, "Jo\nBloggs\u0007").annotations), "Jo Bloggs", "another computer: one line");
  assert.equal(changedBy(stamped(m, "x".repeat(5000)).annotations)!.length, 200);
  assert.deepEqual(detailsOf(s.annotations, PROPERTIES), props, "the properties stay");
  assert.equal(s.annotations!.filter((a) => a.keyword === CHANGED_BY).length, 1);
  // Settings' fields (and the AI tools' properties) rewrite PROPERTIES only: Last changed by stays (stress 23, 24).
  assert.equal(changedBy(withDetails(s.annotations, { title: "New", author: "" }, PROPERTIES)), "Sam Ellis");
  assert.equal(PROPERTIES.some(([, k]) => k === CHANGED_BY), false);
}

// Through CDXML (the root's ModificationUserName, not an annotation), CDX (tag 0x0004), .oct and .oct's CDXML alone
// (stress 15).
{
  const m = stamped(drawing(), "Zoë Möller & <Lab 3> \"B\"");
  const cdxml = toCdxml(m, DEFAULT_STYLE);
  assert.match(cdxml, /<CDXML[^>]*\sModificationUserName="Zoë Möller &amp; &lt;Lab 3&gt; &quot;B&quot;"/);
  assert.doesNotMatch(cdxml, /Keyword="Last changed by"/);
  assert.match(cdxml, /<CDXML[^>]*\sComment="Two&#10;lines"/, "the comment stays the root's");
  const oct = writeOct(m, DEFAULT_STYLE), cdx = xmlToCdx(parseXml(cdxml));
  const back = [fromCdxml(cdxml).mol, fromCdxml(cdxToXml(cdx)).mol, readOct(oct).mol, readOct(oct.replace(/<!--Octet[^]*$/, "")).mol, readCdx(writeCdx(m, DEFAULT_STYLE)).mol];
  for (const b of back) {
    assert.equal(changedBy(b.annotations), "Zoë Möller & <Lab 3> \"B\"");
    assert.deepEqual(detailsOf(b.annotations, PROPERTIES), props);
    assert.deepEqual(b.annotations?.map((a) => a.keyword).sort(), [CHANGED_BY, COMMENT, "GUID", "Title", "Author"].sort());
  }
  // Tag 0x0004 on the document holds the name.
  assert.ok(Array.from(cdx).some((_, i) => cdx[i] === 0x04 && cdx[i + 1] === 0 && cdx[i + 6] === 0x5a && cdx[i + 7] === 0x6f), "tag 0x0004 holds the name");
  assert.equal(readOct(oct).foreign, undefined, "Octet's own file stays Octet's");
  // A drawing never saved writes none.
  assert.doesNotMatch(toCdxml(drawing(), DEFAULT_STYLE), /ModificationUserName/);
}

// Hostile and other programs' files (stress 16 to 19).
{
  const base = toCdxml(drawing(), DEFAULT_STYLE);
  const big = fromCdxml(base.replace("<CDXML", `<CDXML ModificationUserName="${"n".repeat(1_000_000)}"`)).mol;
  assert.equal(changedBy(big.annotations), "n".repeat(200));
  assert.equal(detailsOf(big.annotations, PROPERTIES).title, props.title);
  assert.equal(changedBy(fromCdxml(base.replace("<CDXML", '<CDXML ModificationUserName="a&#10;b&#9;c"')).mol.annotations), "a b c");
  assert.equal(changedBy(fromCdxml(base.replace("<CDXML", '<CDXML ModificationUserName="  "')).mol.annotations), undefined);
  // The root's wins; an annotation with the keyword stays and goes back as it came.
  const both = fromCdxml(base.replace("<CDXML", '<CDXML ModificationUserName="Root"').replace("</page>", '<annotation Keyword="Last changed by" Content="Theirs"/></page>')).mol;
  assert.equal(changedBy(both.annotations), "Root");
  assert.match(toCdxml(both, DEFAULT_STYLE), /<annotation\s+Keyword="Last changed by"\s+Content="Theirs"/);
  // A CDX string with a style run (as ChemDraw writes text) reads as its text.
  const name = new TextEncoder().encode("Pat Lee"), run = new Uint8Array(2 + 10 + name.length);
  run.set([1, 0, 0, 0, 1, 0, 0, 0, 200, 0, 3, 0]); run.set(name, 12);
  const cdx = xmlToCdx(parseXml(base)), at = 22 + 6; // after the header (22 bytes) and the document's tag and id
  const tagged = new Uint8Array([...cdx.slice(0, at), 0x04, 0x00, run.length, 0, ...run, ...cdx.slice(at)]);
  assert.equal(changedBy(fromCdxml(cdxToXml(tagged)).mol.annotations), "Pat Lee");
}

// Where it does not go: a copy of part of the drawing, an own template (stress 20, 21).
{
  const m = stamped({ ...drawing(), atoms: [C, { label: "O", location: [1, 0, 0] }], bonds: [{ atoms: [0, 1], order: 1 }] }, "Sam");
  assert.doesNotMatch(toCdxml(m, DEFAULT_STYLE, { selection: { atoms: [0, 1], items: [] } }), /ModificationUserName/);
  assert.equal(changedBy(templateOf(m).annotations), undefined);
}

// Home's folders keep a drawing's title and author, checked as hostile when read (stress 10 to 12).
{
  const store = { version: 1, projects: [{ id: "abcdefabcdef0123", name: "Route", made: 1, drawings: [{ path: "/a.oct", name: "a", added: 1 }] }], pictures: {} };
  const set = setAbout(store, "/a.oct", { title: "Aspirin", author: "Zoë" });
  assert.deepEqual(set.projects[0].drawings[0], { path: "/a.oct", name: "a", added: 1, title: "Aspirin", author: "Zoë" });
  assert.equal(setAbout(set, "/a.oct", { title: "Aspirin", author: "Zoë" }), set, "nothing new: the same store");
  assert.equal(setAbout(set, "/b.oct", { title: "B" }), set, "a drawing in no folder");
  assert.deepEqual(setAbout(set, "/a.oct", {}).projects[0].drawings[0], { path: "/a.oct", name: "a", added: 1 }, "a title removed goes");
  assert.deepEqual(readStore(writeStore(set)).store.projects[0].drawings[0], set.projects[0].drawings[0]);
  const hostile = JSON.stringify({ ...store, projects: [{ ...store.projects[0], drawings: [{ path: "/a.oct", name: "a", added: 1, title: { x: 1 }, author: "a\nb".repeat(500) }] }] });
  const d = readStore(hostile).store.projects[0].drawings[0];
  assert.equal(d.title, undefined);
  assert.ok(d.author!.length > 190 && d.author!.length <= 200, "one line of 200 at most");
  assert.doesNotMatch(d.author!, /\n/);
  assert.deepEqual(readStore(JSON.stringify(store)).store.projects[0].drawings[0], store.projects[0].drawings[0], "1.1.2's store");
}

// The code: a save writes the drawing stamped with the user's name and amends the drawing with it; Save Copy As
// writes it (an edit made while the Save dialog was open stays); the tiles show the title and author; Settings shows Last changed by read-only; recent.rs keeps them
// checked (stress 1 to 9, 22, 27).
{
  const has = (src: string, re: RegExp) => assert.ok(re.test(src), String(re));
  const editor = read("Editor.tsx"), home = read("Home.tsx"), settings = read("SettingsWindow.tsx"), rs = read("../src-tauri/src/recent.rs");
  has(editor, /const out = stamped\(doc, systemName\)/);
  has(editor, /contents: writeOct\(\{ \.\.\.out, guides \}/);
  has(editor, /if \(path && out !== doc && now\.current === doc\) \{ lastSet\.current = out; dispatch\(\{ type: "amend", mol: out \}\); \}\n\s*if \(path\) setFile\(\{ path, saved: out \}\);/);
  has(editor, /const contents = writeOct\(\{ \.\.\.stamped\(doc, systemName\), guides \}/);
  has(editor, /invoke\("recent_thumb", \{ path, svg: svg \?\? null, title: about\.title \?\? null, author: about\.author \?\? null \}\)/);
  has(home, /shown = d\.title \|\| d\.name/);
  has(home, /\[d\.author, d\.when\]\.filter\(Boolean\)\.join\(" · "\)/);
  has(home, /\[x\.name, x\.details\.author\]\.filter\(Boolean\)\.join\(" · "\)/);
  has(settings, /d\("document", "Properties", CHANGED_BY, .*<span className="setting-value">\{by\}<\/span>/);
  has(rs, /fn about\(v: Option<String>\) -> Option<String>/);
}

console.log("changedby: ok");
