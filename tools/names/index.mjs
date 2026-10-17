// Builds src/nameindex.json: the names Structure to Name can give from Octet's own tables when its namer has no
// name, by standard InChI. From common.ts the systematic name each abbreviation stands for (DBU), or the key where it is
// a name (Wilkinson's catalyst, tetrakis(triphenylphosphine)palladium(0)); from drugs.ts every drug name (not "=name"
// entries) and the KNOWN names.
// Run after changing common.ts or drugs.ts: node tools/names/index.mjs (src/names.check.ts fails until then).
import { readFileSync, writeFileSync } from "node:fs";
const src = new URL("../../src/", import.meta.url), dir = new URL("vendor/opsin/", src);
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
const indigo = await (await import(new URL("../node_modules/indigo-ketcher/indigo-ketcher-norender.js", src))).default();
const { COMMON } = await import(new URL("common.ts", src));
const { DRUGS, KNOWN } = await import(new URL("drugs.ts", src));
export function inchiOf(smiles) {
  const o = new indigo.MapStringString();
  try { return indigo.convert(smiles, "inchi", o).trim() || undefined; } catch { return undefined; } finally { o.delete(); }
}
// In order of preference: the first name for an InChI is kept.
export function entries() {
  const word = (k) => /[a-z]{4}/.test(k);
  return [
    ...Object.values(COMMON).filter((v) => !v.startsWith("smiles:")).map((v) => [v, opsin.parseToSmiles(v)]),
    ...Object.entries(DRUGS).filter(([, v]) => !v.startsWith("=")),
    ...KNOWN.map((n) => [n, opsin.parseToSmiles(n)]),
    ...Object.entries(COMMON).map(([k, v]) => [k, v.startsWith("=") ? COMMON[v.slice(1)] : v]).filter(([k, v]) => v.startsWith("smiles:") && word(k)).map(([k, v]) => [k, v.slice(7)]),
  ];
}
export function build() {
  const index = {};
  for (const [name, smiles] of entries()) {
    const inchi = smiles && inchiOf(smiles);
    if (inchi && !(inchi in index)) index[inchi] = name;
  }
  return index;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const index = build();
  writeFileSync(new URL("nameindex.json", src), JSON.stringify(index, null, 0).replace(/","/g, '",\n"') + "\n");
  console.log(`nameindex: ${Object.keys(index).length} names`);
}
