# Licence and pricing plan

Status: draft, 14 October 2026. This is a plan, not legal advice. Get a
lawyer to check the end-user licence agreement (EULA) before Octet takes
money from anyone.

## Goal

- Free for personal use.
- Universities pay, much less than ChemDraw.
- Companies pay the most.

## Tiers

| Tier       | Who                                                                                    | Price                  | What they get                                     |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------- |
| Personal   | Individuals: students, academics and hobbyists, using Octet for themselves            | Free                   | The full editor                                   |
| University | Universities, colleges, schools and public research institutes that provide Octet     | Low, below ChemDraw    | Site licence and the institution features below   |
| Commercial | Companies: pharma, biotech, CROs, chemical manufacturers, publishers                   | Full price             | Per-seat or site licence, institution features, priority support |

Prices are not decided yet. See [open decisions](#open-decisions).

## What institutions pay for

Charge for what only an institution needs, not for permission to use
Octet. If permission is all a university buys, it has no reason to pay
while its students and staff can use Octet free.

- Central install and updates (managed deployment packages).
- A licence admin console.
- Single sign-on (for example SAML or Shibboleth).
- Support with agreed response times.
- Invoices, purchase orders and the documents that tenders ask for.
- Integrations: paste into Microsoft Office, electronic lab notebooks.
- Security, data-protection (GDPR) and accessibility documents.

Students who use Octet free become the users who ask their department to
buy it.

## Licence of the code

- **Now:** proprietary, all rights reserved. The repository stays
  private. There is no open-source licence.
- **Why not open source:** an open-source licence (MIT, Apache, GPL,
  AGPL) cannot restrict who uses the code. The Open Source Definition
  forbids it ("no discrimination against fields of endeavor"). Any
  university or company could then use Octet free.
- **Why the MIT licence was removed:** MIT lets anyone use, copy and sell
  the code. The repository was private and held no code, so nobody
  received anything under MIT, and removing it affects no one.
- **At launch:** publish a EULA with the three tiers. A lawyer checks it
  first.
- **If the code becomes public later:** use a source-available licence
  for the free tier, such as
  [PolyForm Personal Use 1.0.0](https://polyformproject.org/licenses/personal-use/1.0.0/),
  and sell a separate licence to institutions. Do not use PolyForm
  Noncommercial. It allows educational institutions to use the code free.

## Third-party libraries

Every library in Octet must allow the licence plan above.

- **Allowed:** permissive licences (MIT, BSD, Apache-2.0). For example:
  RDKit (BSD-3-Clause), OPSIN (MIT), Ketcher (Apache-2.0), Indigo
  (Apache-2.0).
- **Not allowed:** GPL and AGPL, for example Open Babel. They would force
  Octet to use the same licence.
- **Check one by one:** LGPL and anything else.
- Keep a list of each dependency and its licence, and ship their notices
  with Octet.

## Clean-room rules for studying ChemDraw

Octet must contain no ChemDraw code or assets, or it cannot be licensed
or sold.

- Study ChemDraw only with your own licensed copy.
- Observe and test its behaviour freely.
- Decompile only for compatibility: CDX and CDXML files, and clipboard
  formats.
- Write findings as specifications in `docs/`. Build Octet from the
  specifications, not from decompiled code.
- Never copy ChemDraw code, icons, templates, text or data files.
- Never touch licence or activation code.
- Do not use "ChemDraw" in Octet's name or logo. Every comparison in
  marketing must be true.

## Open decisions

- [ ] **Define "personal use".** Proposal: an individual's own study,
      coursework, thesis, research and hobby use is personal. Use that an
      organisation installs, provides, pays for or requires (for example
      teaching labs, or staff doing their job) is institutional.
- [ ] **Set prices** for the University and Commercial tiers. Find out
      what ChemDraw costs each segment first.
- [ ] **Contributor agreement.** If anyone else contributes code, they
      must give you the rights you need to sell licences.
- [ ] **How to take money:** sole trader or limited company.
- [ ] **Name check.** Make sure "Octet" is free to use as a software
      name before launch.
