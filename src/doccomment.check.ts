// Run: node src/doccomment.check.ts. Fails loudly if the drawing's comment (Settings > Document > Properties >
// Comment, issue 100) stops keeping its lines, stops being cleaned as hostile text (control characters, half
// characters, its 10,000 limit), stops being ChemDraw's document comment in CDXML (the root's Comment) and CDX (tag
// 0x0009, always UTF-8), stops coming back through .oct, or goes where it does not belong (a copy, an own template).
import assert from "node:assert/strict";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { COMMENT, MAX_COMMENT, PROPERTIES, cleanComment, commentText, detailsOf, oneLine, templateOf, withDetails } from "./experiment.ts";
import { fromCdxml, parseXml, toCdxml } from "./cdxml.ts";
import { cdxToXml, xmlToCdx } from "./cdx.ts";
import { lostText, readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import type { Annotation, Mol } from "./render.ts";

const C = { label: "C", location: [0, 0, 0] as [number, number, number] };
const drawing = (props: Record<string, string>, more: Annotation[] = []): Mol => ({ atoms: [C], bonds: [], annotations: withDetails(more, props, PROPERTIES) });
// The comment after each way through: CDXML, CDX (from Octet's CDXML), .oct, .oct's CDXML alone, Octet's CDX file.
const through = (m: Mol) => {
  const cdxml = toCdxml(m, DEFAULT_STYLE), oct = writeOct(m, DEFAULT_STYLE);
  return [fromCdxml(cdxml).mol, fromCdxml(cdxToXml(xmlToCdx(parseXml(cdxml)))).mol, readOct(oct).mol, readOct(oct.replace(/<!--Octet[^]*$/, "")).mol, readCdx(writeCdx(m, DEFAULT_STYLE)).mol]
    .map((x) => detailsOf(x.annotations, PROPERTIES).comment);
};

// B1. The cleaner: lines kept, line ends as line feeds, tabs as spaces, other control characters and half characters
// gone, ends trimmed, at most 10,000 units cut between characters. Empty is no comment (stress 21, 23, 24, 26).
{
  assert.equal(commentText("  one\r\ntwo\rthree\n\nfive\t6\u0007\u001b\u007f  \n"), "one\ntwo\nthree\n\nfive 6");
  assert.equal(commentText(" \n\r\n\t "), "");
  assert.equal(withDetails(undefined, { comment: " \n \n" }, PROPERTIES), undefined);
  assert.equal(commentText(`a\ud800b\udc00c😀`), "abc😀", "half characters go, whole ones stay");
  assert.equal(commentText("x".repeat(MAX_COMMENT)), "x".repeat(MAX_COMMENT));
  assert.equal(commentText("x".repeat(MAX_COMMENT + 1)).length, MAX_COMMENT);
  const emoji = commentText(`${"x".repeat(MAX_COMMENT - 1)}😀`);
  assert.equal(emoji, "x".repeat(MAX_COMMENT - 1), "an emoji across the limit goes whole");
  assert.equal(cleanComment("x".repeat(MAX_COMMENT + 5)).length, MAX_COMMENT + 5, "cleanComment cuts nothing");
  // oneLine (title, author, keywords, experiment details) cuts between characters too (a split emoji stopped PDF export).
  assert.equal(oneLine(`${"a".repeat(199)}😀`), "a".repeat(199));
  assert.equal(oneLine(`${"a".repeat(198)}😀`), `${"a".repeat(198)}😀`);
  assert.equal(oneLine(`T\ud83d itle`), "T itle");
  // A comment is a document property: the first annotation with its keyword (Document comment, decision D9), beside
  // the others, which stay.
  assert.equal(COMMENT, "Document comment");
  assert.deepEqual(PROPERTIES.find(([k]) => k === "comment"), ["comment", COMMENT]);
  const m = drawing({ title: "T", comment: "Line 1\nLine 2" }, [{ keyword: "GUID", content: "1" }, { keyword: "Comment", content: "theirs" }]);
  assert.deepEqual(m.annotations, [{ keyword: "GUID", content: "1" }, { keyword: "Comment", content: "theirs" }, { keyword: "Title", content: "T" }, { keyword: COMMENT, content: "Line 1\nLine 2" }]);
  assert.deepEqual(detailsOf(m.annotations, PROPERTIES), { title: "T", comment: "Line 1\nLine 2" });
  // Not an experiment detail.
  assert.equal(detailsOf(m.annotations).title, "T");
  assert.equal(Object.keys(detailsOf(m.annotations)).includes("comment"), false);
}

// B3, B4. CDXML: the root's Comment, not an annotation; CDX: tag 0x0009 in UTF-8. Every way keeps the lines (stress 22,
// 29).
{
  const comment = "Line one\n\nline 3: é → 日本 😀, a (b) \\c )( & < > \" ' ]]>";
  const m = drawing({ title: "T", comment });
  const cdxml = toCdxml(m, DEFAULT_STYLE);
  assert.match(cdxml, /<CDXML[^>]*\sComment="Line one&#10;&#10;line 3: é → 日本 😀, a \(b\) \\c \)\( &amp; &lt; &gt; &quot; &apos; \]\]&gt;"/);
  assert.doesNotMatch(cdxml, /Keyword="(Document )?Comment"/);
  assert.match(cdxml, /Keyword="Title"/);
  assert.deepEqual(through(m), Array(5).fill(comment));
  // Tag 0x0009 on the document, its bytes UTF-8 with CR line ends.
  const cdx = xmlToCdx(parseXml(cdxml)), bytes = new TextEncoder().encode(comment.replace(/\n/g, "\r"));
  const at = Array.from(cdx).findIndex((_, k) => cdx[k] === 0x09 && cdx[k + 1] === 0 && cdx.slice(k + 6, k + 6 + bytes.length).every((b, j) => b === bytes[j]));
  assert.ok(at > 0, "tag 0x0009 holds the comment as UTF-8");
  // A comment Mac Roman could hold is UTF-8 too (ChemDraw lost ë and ö from the Mac Roman form).
  const mac = xmlToCdx(parseXml(toCdxml(drawing({ comment: "Zoë Möller" }), DEFAULT_STYLE)));
  assert.ok(Buffer.from(mac).includes(Buffer.from("Zoë Möller", "utf8")));
  // Tabs from a spreadsheet are spaces, and the .oct still opens from its own data (stress 23).
  const tabs = drawing({ comment: "a\tb\tc\n1\t2\t3" });
  assert.deepEqual(through(tabs), Array(5).fill("a b c\n1 2 3"));
  assert.equal(readOct(writeOct(tabs, DEFAULT_STYLE)).foreign, undefined);
  // 10,000 kept everywhere.
  assert.deepEqual(through(drawing({ comment: "y".repeat(MAX_COMMENT) })), Array(5).fill("y".repeat(MAX_COMMENT)));
}

// ChemDraw's own files: a literal line break in the root's Comment is a line (ChemDraw writes it so); CR LF and CR are
// line feeds; a root Comment and a Comment annotation both stay, the root's first (stress 30, 31).
{
  const base = toCdxml(drawing({ title: "T" }), DEFAULT_STYLE);
  const chemdraw = base.replace("<CDXML", '<CDXML\n Comment="first\nsecond\r\nthird\rfourth\tend"');
  assert.deepEqual(fromCdxml(chemdraw).mol.annotations?.[0], { keyword: COMMENT, content: "first\nsecond\nthird\nfourth end" });
  // Line breaks in other attributes are still spaces (XML's rule).
  assert.equal(fromCdxml(base.replace('Keyword="Title"\n Content="T"', 'Keyword="Title"\n Content="A\nB"')).mol.annotations?.find((a) => a.keyword === "Title")?.content, "A B");
  const both = base.replace("<CDXML", '<CDXML Comment="root one"').replace("</page>", '<annotation Keyword="Comment" Content="annotation one"/></page>');
  const read = fromCdxml(both).mol;
  assert.equal(detailsOf(read.annotations, PROPERTIES).comment, "root one");
  const again = toCdxml(read, DEFAULT_STYLE);
  assert.match(again, /<CDXML[^>]*\sComment="root one"/);
  assert.match(again, /<annotation\s+Keyword="Comment"\s+Content="annotation one"/);
  assert.deepEqual(fromCdxml(again).mol.annotations?.filter((a) => /comment/i.test(a.keyword)).map((a) => [a.keyword, a.content]), [[COMMENT, "root one"], ["Comment", "annotation one"]]);
  // An annotation Comment alone is no document comment: Settings shows none, and it goes back as it came.
  const theirs = fromCdxml(base.replace("</page>", '<annotation Keyword="Comment" Content="theirs"/></page>')).mol;
  assert.equal(detailsOf(theirs.annotations, PROPERTIES).comment, undefined);
  assert.doesNotMatch(toCdxml(theirs, DEFAULT_STYLE), /<CDXML[^>]*\sComment=/);
  // A file without a comment writes none.
  assert.doesNotMatch(base, /\sComment=/);
  assert.doesNotMatch(toCdxml({ atoms: [C], bonds: [] }, DEFAULT_STYLE), /\sComment=/);
}

// Hostile files: a comment over the limit is left out and counted, the drawing opens (stress 32); a half character
// from an .oct goes (stress 27); a character reference to half a character is a damaged file, as before.
{
  const base = toCdxml(drawing({ title: "T" }), DEFAULT_STYLE);
  for (const n of [MAX_COMMENT + 1, 1_000_000]) {
    const r = fromCdxml(base.replace("<CDXML", `<CDXML Comment="${"z".repeat(n)}"`));
    assert.equal(detailsOf(r.mol.annotations, PROPERTIES).comment, undefined);
    assert.equal(detailsOf(r.mol.annotations, PROPERTIES).title, "T");
    assert.equal(lostText(r.lost), "1 comment");
  }
  assert.throws(() => fromCdxml(base.replace("<CDXML", '<CDXML Comment="a&#xD800;b"')));
  const half = { atoms: [C], bonds: [], annotations: [{ keyword: COMMENT, content: "a\ud800b" }, { keyword: "Title", content: "T\udc00" }] } as Mol;
  const oct = writeOct(half, DEFAULT_STYLE), back = readOct(oct).mol;
  assert.equal(back.annotations?.[0].content, "a\ud800b", "the .oct keeps what it was given");
  const info = detailsOf(back.annotations, PROPERTIES);
  assert.deepEqual(info, { title: "T", comment: "ab" });
  assert.doesNotMatch(JSON.stringify(info), /\\ud[89a-f]/i, "the PDF's information has no half character");
  // An annotation with a tab or a CR in .oct data is damaged (1.1.2's rule): the comment never has one.
  const typed = drawing({ comment: "a\tb\r\nc" });
  assert.equal(readOct(writeOct(typed, DEFAULT_STYLE)).foreign, undefined);
  assert.equal(readOct(writeOct(typed, DEFAULT_STYLE)).mol.annotations?.[0].content, "a b\nc");
}

// Where it does not go: a copy of part of the drawing (so a paste never changes another drawing's comment, stress 38),
// and an own template made from an experiment page (stress 37).
{
  const m: Mol = { atoms: [C, { label: "O", location: [1, 0, 0] }], bonds: [{ atoms: [0, 1], order: 1 }], annotations: withDetails(undefined, { title: "T", comment: "A" }, PROPERTIES) };
  const copy = toCdxml(m, DEFAULT_STYLE, { selection: { atoms: [0, 1], items: [] } });
  assert.doesNotMatch(copy, /\sComment=/);
  assert.equal(fromCdxml(copy).mol.annotations, undefined);
  const page = { ...m, annotations: [...m.annotations!, { keyword: "Date", content: "17 November 2026" }, { keyword: "Notebook", content: "SE-1" }] };
  assert.deepEqual(templateOf(page).annotations, [{ keyword: "Title", content: "T" }, { keyword: "Notebook", content: "SE-1" }]);
}

console.log("doccomment: ok");
