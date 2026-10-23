# OPSIN for Octet

Octet converts chemical names to structures offline with [OPSIN](https://github.com/dan2097/opsin)
2.8.0 (MIT), compiled from Java to JavaScript with [TeaVM](https://teavm.org) 0.16.0 (Apache-2.0).
There is no Java runtime in the app.

`build.sh` writes the two files Octet ships, in `src/vendor/opsin/`:

- `opsin.js`: OPSIN, its dependencies and the TeaVM runtime, as an ES module.
- `opsin-data.bin`: OPSIN's resources (XML and automata) in one file. The app passes it to
  `opsin.js` through `globalThis.opsinResource(name)`.

Octet replaces five classes so OPSIN runs without Java's file system, class loader and
serialisation. They are in `js/src`:

- `ResourceGetter`: reads resources from the data file.
- `MiniXmlReader`: a small XML reader (TeaVM has no `javax.xml.stream`).
- `AutomatonInitialiser` and `RunAutomaton`: load the prebuilt automata from the format
  `pack/.../PackBuilder.java` writes. `RunAutomaton` is modified from dk.brics.automaton
  (BSD-3-Clause) and keeps its licence header.
- `org.apache.logging.log4j`: a stub that logs nothing.

`opsin.js` exports `parseToSmiles`, and `parseToAtoms` (Octet's `OctetAtoms`, also in `js/src`):
the structure OPSIN builds for a name, with each atom's locants, as JSON. Structure to Name uses
the locants to check the donor atoms it cites in names of coordination compounds (κ terms).

Octet adds to OPSIN's data, as patches to its resources in `pack/` (each named for the file it changes, applied by
`build.sh` to a copy of OPSIN 2.8.0's file before packing):

- `arylGroups.patch`: two retained parents of the IUPAC tetrapyrrole recommendations (1986), next to porphyrin.
  Phthalocyanine (TP-1.6, Fig. 4; the Red Book's ligand pc is phthalocyanine-29,31-diido) and corrole (TP-5.3,
  Fig. 11), each with the numbering of its figure, the interior N atoms included (29 to 32; 21 to 24). Fig. 4 leaves
  phthalocyanine's fusion atoms unnumbered: they take letters as fusion atoms do (FR-5.3: 4a, 7a, 11a). Like porphyrin,
  each name implies hydrogen on the interior N atoms of its figure (29H,31H; 21H,22H,23H), and indicated hydrogen
  places it elsewhere (30H,32H-phthalocyanine). OPSIN 2.8.0 read no name for either ring.

As these parents are Octet's own data, `src/macrocycles.check.ts` checks them against sources outside it: PubChem's
InChI for each parent, the figures' rings as cycles of locants, and derivatives drawn by hand from the figures with a
substituent at every position. `opsin.js` does not change with the data: only `opsin-data.bin` and `names.txt` do.

Rebuild after changing any of them, or to move to a new OPSIN version:

    JAVA_HOME=/path/to/jdk-21 MVN=/path/to/mvn tools/opsin/build.sh

Licences of the shipped code are in THIRD_PARTY.md.
