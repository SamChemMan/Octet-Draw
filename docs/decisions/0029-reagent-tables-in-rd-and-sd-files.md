# 0029: Reagent tables in RD and SD files, and the ELN archive

Status: built 19 November 2026 for release 1.1.3 (issue 117). The plan is `docs/plans/issue-117-117-1-1-3.md`.

Octet's RD and SD files carry each reagent table's values, so an electronic lab notebook, a compound registry or a
spreadsheet gets the amounts with the structures. File > More Formats > Export ELN Archive… writes The ELN Consortium's
`.eln` file with the drawing's files.

## What was decided

1. **RDF is the record, SDF is the compounds.** Each reagent table is one RD record: its reaction is the table's
   structures (reactants, then the structures over and under the arrow, then products, in the table's order), then its
   fields. A table of a whole scheme is one record of the scheme's first reactants, every agent and its last products. A
   reaction with no table writes its steps as before, with no fields. In an SD file each compound in a table gets its
   column's fields as data items.
2. **Field names.** RD fields follow the CTfile specification's own RD file example: `RXN:VARIATION(1):` then a group,
   then the field. SD items use the field alone.

   | Group (RD) | What |
   | --- | --- |
   | `EXPERIMENT:` | Title, Exp. number, Date (2026-11-19 when it reads as a date), Notebook, Project, Author, Temperature, Time, Pressure, Solvent, Keywords |
   | `CONDITIONS:` | The table's Temperature, Time, Atmosphere, Other |
   | `REACTANT(n):`, `AGENT(n):`, `PRODUCT(n):` | The n-th reactant, agent or product molecule of the record's rxnfile |
   | `REAGENT(n):` | The n-th text reagent (written over or under the arrow, no molecule) |
   | `ABOVE(n)`, `BELOW(n)` | Each line of text over and under the arrow |
   | `OCTET:Reagent table` | Octet's table as one line of JSON, as `.oct` keeps it |

   A component's fields, in this order: `Role` (Reactant, Catalyst, Solvent or Product), `Name`, `Number`, `Formula`,
   `MW [g/mol]`, `Limiting` (Yes), `Equivalents`, `Mass [mg]`, `Moles [mmol]`, `Volume [mL]`, `Density [g/mL]`,
   `Molarity [mol/L]`, `Concentration [mol/L]`, `Purity [%]`, `Expected mass [mg]`, `Expected moles [mmol]`,
   `Measured mass [mg]`, `Yield [%]`, then each row of the user's own by its name. An SD record starts with `Reaction`
   (its record's number in the RD file) and ends with the experiment fields, without their group.
3. **Fixed units in the names, plain numbers in the values.** One unit for each kind of quantity whatever the table
   shows. A point, no thousands separator, no exponent, at most 6 significant figures. A catalyst's equivalents are a
   number (0.05), not mol%.
4. **The table as shown.** Amounts follow the rows and cells shown: a hidden row or a blanked cell writes nothing. A
   hidden column's structure stays in the reaction (it is drawn) but has no fields. What a component is (Role to
   Limiting) is always written. Text typed over an amount does not change the number written.
5. **Octet reads its own record back.** The table comes back from `OCTET:Reagent table` (read with `readGrid` as
   hostile input), the text over and under the arrow from `ABOVE` and `BELOW`, and the compound numbers from `Number`,
   matched to the structures by where they stand. Another program's fields make no table: they do not say what was
   typed and what was worked out.
6. **RD lines.** A line past column 80 goes on at column 1 of the next line. The break moves earlier so that no line
   starts with `$` and no character is split. A reader joins a line that does not start with `$` to the one before.
7. **Hostile RD text.** At most 2,000 fields a record, 10,000 characters a value (100,000 for Octet's table), control
   characters taken out, one pass. A damaged table is left out and the reaction kept.
8. **The ELN archive.** A zip of one folder named as the drawing, holding `ro-crate-metadata.json` (RO-Crate 1.2,
   `sdPublisher` Octet) and one dataset with the `.oct`, CDXML, RD and SD files. The dataset takes the Title, Author and
   Keywords, and every experiment detail as a `PropertyValue`. Rust checks every path the page sends (one root folder,
   at most one folder below it, no `..`, backslash, colon or control character, at most 12 files and 64 MB).
9. **No new format in Export.** RDF and SDF already were there. The archive is a File > More Formats item, as 3MF is.
