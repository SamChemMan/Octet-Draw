# Releases

How Octet's installers are built, signed and published. The workflow is `.github/workflows/release.yml`.

## What Sam must add

Add each secret in GitHub: the repository's Settings > Secrets and variables > Actions > New repository
secret. Every secret is optional. When one is not set, the build still runs, and the installer is not signed
in that way. An unsigned installer works, but macOS and Windows show a warning when it opens.

### Updates (REL-10, decision 0010)

The update signing key pair was made on Sam's Mac on 18 October 2026. The public key is in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). The private key is `~/.tauri/octet-updater.key`. It has
no password.

1. Add the secret `TAURI_SIGNING_PRIVATE_KEY`: the whole text of `~/.tauri/octet-updater.key`.
2. Keep a copy of the key in a password manager. If the key is lost, the Octets that are installed can never
   update again.
3. Never put the key in the repository.

To use a key with a password, make a new pair with `npx tauri signer generate -w ~/.tauri/octet-updater.key -f`,
put the new public key in `tauri.conf.json`, and add the password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Do
this before the first release: after it, a new key stops updates to the copies already installed.

### macOS: Developer ID and notarisation (REL-5)

1. Join the Apple Developer Program as an individual (developer.apple.com/programs).
2. Make a "Developer ID Application" certificate (Xcode > Settings > Accounts > Manage Certificates, or
   developer.apple.com > Certificates).
3. In Keychain Access, export the certificate and its private key as a .p12 file with a password.
4. Add these secrets:

| Secret | Value |
| ------ | ----- |
| `APPLE_CERTIFICATE` | The .p12 file in base64: `base64 -i Octet.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | The .p12 file's password |
| `APPLE_SIGNING_IDENTITY` | The certificate's name, as `security find-identity -v -p codesigning` shows it, for example `Developer ID Application: Sam Ellis (AB12CD34EF)` |
| `APPLE_ID` | The email of the Apple account |
| `APPLE_PASSWORD` | An app-specific password (account.apple.com > Sign-In and Security > App-Specific Passwords) |
| `APPLE_TEAM_ID` | The 10-character team ID (developer.apple.com > Account > Membership) |

`APPLE_SIGNING_IDENTITY` is necessary with the certificate: without it the build stops. The build is signed
with the hardened runtime and notarised.

To check a build: `spctl -a -vv /Applications/Octet.app` must say `source=Notarized Developer ID`, and
`xcrun stapler validate Octet_1.0.0_universal.dmg` must say `The validate action worked!`.

### Windows: code signing (REL-6)

Since June 2023 a code signing certificate's private key must stay in hardware or in a cloud signing service,
so most new certificates do not come as a .pfx file. The workflow takes either of these:

- **A cloud signing service** (recommended). Azure Trusted Signing is the simplest with Tauri; check that it
  accepts an individual in the UK. Add:
  - `WINDOWS_SIGN_COMMAND`: for example
    `trusted-signing-cli -e https://weu.codesigning.azure.net -a <account> -c <profile> -d Octet %1`.
    The workflow installs `trusted-signing-cli` when the command starts with it. Another service needs its
    own tool in the workflow.
  - `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`: the app registration that may sign.
- **A .pfx file**, if the certificate comes as one:
  - `WINDOWS_CERTIFICATE`: the .pfx file in base64: `base64 -i Octet.pfx | pbcopy`.
  - `WINDOWS_CERTIFICATE_PASSWORD`: its password.

A .pfx certificate signs with SHA-256 and a DigiCert RFC 3161 time stamp (`bundle.windows` in `tauri.conf.json`).
A cloud signing service adds its own time stamp. SmartScreen can still warn about a new certificate until enough
people have installed Octet.

To check a build: right-click the installer > Properties > Digital Signatures.

### Linux

Nothing to add. The .deb, .rpm and AppImage are not signed. Updates to the AppImage are signed with the
update key.

## Make a release

1. Set the version: `npm version 1.0.0 --no-git-tag-version`. It changes `package.json` and
   `package-lock.json`. Everything else reads the version from `package.json` (REL-9): the app, the
   installers, About and the CreationProgram in CDXML files. Do this only for a release.
2. In `CHANGELOG.md`, change "(not released yet)" to the date, and list what changed.
3. Commit, tag and push: `git tag v1.0.0` and `git push origin main v1.0.0`. The tag must be `v` followed
   by the version in `package.json`, or the workflow stops.
4. Actions > Release runs the checks, then builds on macOS, Windows and Linux. It makes a draft release with
   the installers, their update signatures and `latest.json` (the update feed).
5. Install each installer on a clean machine with no network, as the brief's definition of done asks.
6. Publish the draft release. Each Octet that checks for updates then finds it.
7. For the first release, remove the line "No release is out yet…" from `README.md`.

The public release has no Feedback box (REL-8): the workflow builds a tag with `OCTET_FEEDBACK=0`. Make the public
release only from a tag, never with a local `npm run tauri build`, which has Feedback.

## Test builds for testers

Actions > Release > Run workflow makes a test build from the branch chosen. It has the Feedback box (⌘ with 1,
2 and 3 pressed together; Ctrl on Windows and Linux) unless the box "Put the Feedback box in the test build" is
cleared. The installers are under Artifacts at the bottom of the run's page. A test build makes no release.
Until the Mac build is signed (REL-5), a tester opens it the first time from System Settings > Privacy & Security >
Open Anyway.

On the Mac: `npm run tauri dev` and `npm run tauri build` have Feedback, so a build made there for testers has it.
`OCTET_FEEDBACK=0 npm run tauri build` makes one with no Feedback, as the public release is.

## What each release has

| Platform | Files |
| -------- | ----- |
| macOS 12 or later | `Octet_<version>_universal.dmg`: one app for Apple silicon and Intel |
| Windows 10 and 11 (64-bit) | `Octet_<version>_x64-setup.exe` and `Octet_<version>_x64_en-US.msi`; `Octet_<version>_x64-offline-setup.exe` |
| Linux (64-bit) | `.deb`, `.rpm` and `.AppImage` |

Windows has two setup programs (REL-21). Octet needs the WebView2 runtime. Windows 11 has it, and Windows Update
puts it on almost every Windows 10 PC. The usual setup program is small: it downloads WebView2 only if the PC
does not have it. The offline setup program has the whole WebView2 runtime in it, so it installs with no
internet, but it is much larger. The brief asks for a small download, so the small one is the usual one.

## Checks

`.github/workflows/check.yml` runs on every push and pull request, and before each release:

- `npm test`: the type check, then every `src/*.check.ts` file.
- `cargo test` for the Rust code.
- `npm audit` and `cargo audit` (REL-26). `src-tauri/.cargo/audit.toml` leaves out RUSTSEC-2024-0429 (see
  below).

## Licence notices

`node scripts/licences.mjs` writes `src-tauri/licences/third-party.txt`: the licence of every Rust crate and
npm package Octet ships, with OPSIN's, nmrshiftdb2's and PubChem's notices (REL-12). Sam approved the InChI 1.06,
MPL-2.0, Unicode-3.0 and PubChem data licences on 18 October 2026. About > Licences opens it. Run the
script after a dependency changes and commit the file. The release workflow runs it before each build.

## The glib alert in Dependabot (REL-26)

glib 0.18 is unsound (RUSTSEC-2024-0429) in `VariantStrIter`, which Octet never calls. glib comes only on
Linux, through the GTK 0.18 crates that Tauri uses, so Octet cannot update it. In GitHub: Security >
Dependabot > the glib alert > Dismiss alert > "Vulnerable code is not actually used", with the note "Linux only,
through Tauri's GTK 0.18 crates. Octet does not call VariantStrIter."

## Before the first release

- The identifier is `io.github.samchemman.octet-draw` (`tauri.conf.json`), set on 18 October 2026 when Sam named
  the app Octet Draw (Octet is now the family name). It names the folder of the app's settings and recent drawings,
  so it cannot change after the first release (REL-32). The clipboard type `io.github.samchemman.octet.json` and the
  `.oct` document type stay Octet-wide, so the other Octet apps can share them.
- Install the .deb and .rpm on Linux and check that Check for Updates works there (decision 0010).
