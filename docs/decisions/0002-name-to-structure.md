# 0002: Name to structure with OPSIN compiled to JavaScript

Status: decided, 16 October 2026.

## Decision

Octet converts chemical names to structures offline with OPSIN 2.8.0 (MIT), compiled from Java to an
ES module with TeaVM 0.16.0. There is no Java runtime in the app. `tools/opsin/build.sh` rebuilds it;
the output is committed in `src/vendor/opsin/`.

## Why

- OPSIN is the most accurate open name-to-structure tool, and its licence fits Octet.
- Shipping a JRE would add about 40 MB and a GPLv2 with Classpath Exception runtime.
- A spike checked the TeaVM build against OPSIN on the JDK: 148 of 148 names gave the same SMILES
  (`tools/opsin/check.mjs` repeats this). In JavaScriptCore it loads in about 150 ms and converts a
  name in about 0.5 ms, fast enough for a live preview while typing.
- The JavaScript output has no `eval`, so the CSP stays strict. The Wasm GC build also worked but was
  slower in JavaScriptCore and needs `wasm-unsafe-eval`.

## Costs

- About 380 KB (gzipped) of JavaScript and a 6.9 MB data file, loaded in the background after start-up.
- Five replaced classes to keep up to date when OPSIN changes (see `tools/opsin/README.md`).
- TeaVM's case tables come from Unicode's data files (Unicode License v3). Sam approved that licence.

## Structure to name

OPSIN only reads names. Octet writes names with its own namer, built from the public IUPAC 2013
recommendations. Every name it writes is parsed back with OPSIN and must give the same structure, so a
wrong name is never shown.

When the namer has no name for a structure, Octet gives a name from its own tables instead: the systematic name an
abbreviation in `src/common.ts` stands for, a drug name from `src/drugs.ts`, or a known name OPSIN reads (morphine,
adamantane). `src/nameindex.json` lists them by standard InChI (`tools/names/index.mjs` builds it). Each is read back
and checked the same way.

## Reading order

Paste, the name field and the command palette read text as a name first (Octet's tables, then OPSIN), and as SMILES
only when the text looks like SMILES. Indigo reads some words as SMILES or SMARTS ("aspirin" as a chain of S, P and
query atoms), so a word is never read as SMILES.
