# 0006: NMR prediction, property prediction and every chemistry feature of ChemDraw 26.1 are in scope

Status: decided by Sam, 16 October 2026. Changes the brief's "Out of scope for version 1" list.

## Decision

- The baseline is ChemDraw 26.1 (it was 22.2). Every chemistry feature of it is in scope. Biology features
  (HELM, biopolymers, sequences, antibodies, plasmids) stay out for now.
- ¹H and ¹³C NMR prediction, with spectra, is in scope. Sam: "low key a massive feature we all use very often".
- Property prediction is in scope: the values ChemDraw's Chemical Properties window shows (boiling and melting
  points, critical temperature, pressure and volume, heat of formation, Gibbs energy, logP, molar refractivity,
  Henry's law constant, tPSA, logS, pKa).
- Markush structures (R-group queries, variable attachment, generic structures) move into scope, because ChemDraw
  26.1 has them.
- 3D views: Structure Perspective is already built. Other 3D work follows ChemDraw 26.1.
- Still out of scope: retrosynthesis, AI features, collaboration, a mobile app and a web app.

## NMR data

Sam approved the nmrshiftdb2 data (16 October 2026). Its licence is the nmrshiftdb2 Database License, a
derivative of ODbL 1.0. What follows from it:

- The shift table Octet builds from nmrshiftdb2 is under that licence (share-alike). It lives in its own folder
  with the licence text, apart from Octet's Apache-2.0 code.
- Octet credits nmrshiftdb2 in the About window and in the metadata of exported spectra.
- Octet stays OSI-licensed, which the data licence requires of software that relies on it.

## Methods

- logP and molar refractivity: Wildman–Crippen, through Indigo (already a dependency).
- tPSA (Ertl), Joback group contributions, ESOL logS, Henry's law and pKa groups: written in Octet from the
  primary papers and permissively licensed tables, each cited in the code.
- NMR: HOSE codes looked up in a table built from nmrshiftdb2. Octet computes the codes on its own molecular
  graph, with the same code that builds the table, so lookups always match. No second chemistry engine.

## Why

Chemists predict NMR spectra and properties every day, and ChemDraw has had both for years. Octet replaces
ChemDraw, so leaving them out would make it worse for daily work.
