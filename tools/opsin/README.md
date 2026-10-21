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

Rebuild after changing any of them, or to move to a new OPSIN version:

    JAVA_HOME=/path/to/jdk-21 MVN=/path/to/mvn tools/opsin/build.sh

Licences of the shipped code are in THIRD_PARTY.md.
