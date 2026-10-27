# 0010: Octet checks for updates by default

Status: built for plan item REL-10 on stream/release, 18 October 2026, as a question on first launch. Sam answered
brief section 11, question 5 on 27 October 2026: "Updates should be on by default." `updates` now starts as true and
the first-launch question is gone.

## Decision

- Octet checks for updates when it opens, unless the user turns checks off in Settings > General > Updates.
  A user who never answered the old first-launch question has checks on. A user who chose Don't Check keeps it.
- With checks off, Octet goes online for updates only when the user chooses Check for Updates… (Octet menu on the
  Mac, Help menu on Windows and Linux) or Check Now.
- With checks on, Octet checks 5 seconds after it opens. With no network the check fails quietly,
  and a check with no answer stops after 30 seconds. Drawing never waits for it.
- An update found asks before it installs: "Update to Octet 1.0.1?" with Update and Cancel. Update asks to
  save unsaved changes first, then installs and starts Octet again. Cancel asks again at the next start. The
  question never shows over another one; then it waits for the next check.
- Every update is signed. The updater checks the signature against the public key in
  `src-tauri/tauri.conf.json` and installs nothing that does not match. The private key is not in the
  repository (see `docs/release.md`).

## ChemDraw

ChemDraw 26.1 uses Sparkle. Its Info.plist sets SUEnableAutomaticChecks = 1 and SUAllowsAutomaticUpdates = 0:
it checks without asking, and asks before it installs. It has ChemDraw > Check for Updates… on the Mac
(Help > Check for Updates… in its guide), and it needs a Signals login. Octet asks first, needs no login, and
has the same menu item.

## How it is built

- `tauri-plugin-updater` (Apache-2.0 OR MIT), from Rust only (`src-tauri/src/update.rs`). The page has no
  updater permission. Its TLS is rustls with the system's certificates.
- The update feed is `latest.json` on the latest GitHub release, which the release workflow makes
  (`.github/workflows/release.yml`). macOS gets the universal app, Windows the NSIS installer, Linux the
  AppImage. Not yet checked: how an Octet installed from the .deb or .rpm package updates. Test it on a
  Linux machine before 1.0.0.
- The setting is `updates` in Octet's settings (`src/settings.ts`): true unless the user turned it off.
