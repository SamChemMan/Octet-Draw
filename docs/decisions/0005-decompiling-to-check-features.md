# 0005: Decompile ChemDraw to check what it can do

Status: decided by Sam, 16 October 2026. Widens the line in CLAUDE.md ("ChemDraw: what we can use"), which
allowed decompiling only for file and clipboard compatibility.

## Decision

Claude may decompile and inspect ChemDraw 22.2 on Sam's Mac to list what it can do:

- its commands, menus and context menus;
- the options each tool and object has;
- the properties each object takes.

This is a check of functionality. Octet's design and code are its own.

## Limits

- Learn what a feature does, never how ChemDraw implements it. Do not follow its code structure, algorithms
  or data layout, except the file and clipboard formats Octet must read and write.
- Raw output (decompiled code, disassembly, strings, resources) stays in `~/octet-research/` on Sam's Mac.
  None of it goes into this repository.
- Notes describe features in our own words.
- Never touch licence or activation code.

## Why

Sam found features Octet had missed (colour on every object, Select All, hold to Select). Running ChemDraw and
reading its help did not list every option. A full list from the program itself makes the cross-check complete.

## Risk

Decompiling beyond what interoperability needs is less clearly protected than observing a program in use. Keeping
raw output out of the repository and writing every feature from its behaviour keeps Octet's code independent.
