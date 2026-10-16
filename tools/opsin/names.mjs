// Builds src/vendor/opsin/names.txt: whole chemical names made from OPSIN's own vocabulary (its group tokens,
// alone or with a common ending), each one checked by OPSIN. Octet uses the list to complete and correct names.
// Usage: node tools/opsin/names.mjs   (after build.sh)
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../../src/vendor/opsin/", import.meta.url);
const pack = readFileSync(new URL("opsin-data.bin", dir));
const files = new Map();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
globalThis.opsinResource = (name) => files.get(name) ?? null;
const opsin = await import(new URL("opsin.js", dir));
opsin.init();

const ENDINGS = ["", "e", "ine", "ane", "ene", "yne", "ol", "ole", "one", "ose", "al", "ide", "ic acid", "oic acid", "in", "an"];
const words = new Set();
for (const [path, bytes] of files) {
  if (!path.endsWith(".xml") || /regex|suffix|multiplier|infix|unsaturator|charge|index|wordRules/i.test(path)) continue;
  const xml = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8");
  for (const list of xml.matchAll(/<tokenList(\s[^>]*)>([\s\S]*?)<\/tokenList>/g)) {
    if (!/tagname="group"/.test(list[1])) continue;
    for (const t of list[2].matchAll(/<token[^>]*>([^<]*)<\/token>/g))
      for (const stem of t[1].split("|")) if (/^[a-z][a-z -]{2,}$/.test(stem)) words.add(stem);
  }
}
const names = new Set();
for (const stem of words) for (const end of ENDINGS) {
  const name = stem + end;
  if (name.length < 4 || names.has(name)) continue;
  try { if (opsin.parseToSmiles(name)) names.add(name); } catch { /* not a name */ }
}
// Where a name is also read with a final e (phenylalanin, phenylalanine), keep the English spelling only.
const list = [...names].filter((n) => !names.has(n + "e")).sort();
writeFileSync(new URL("names.txt", dir), list.join("\n") + "\n");
console.log(`names: ${list.length} names from ${words.size} stems`);
