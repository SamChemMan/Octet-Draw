{
  description = "Octet Draw: draw chemical structures and reactions";

  #   nix build           builds Octet into ./result
  #   nix run             builds and opens Octet
  #   nix develop         a shell where `npm ci` and `npm run tauri dev` work
  #
  # Systems: x86_64-linux, aarch64-linux, x86_64-darwin and aarch64-darwin.
  #
  # Hashes need to be changed whenever package-lock.json or src-tauri/Cargo.lock changes.

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      inherit (nixpkgs) lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # The package, in the form nixpkgs takes (pkgs/by-name/oc/octet-draw/package.nix): a function of nixpkgs
      # packages only, called with callPackage. To move it, copy this function into that file, replace `src` with
      # fetchFromGitHub at tag "v${version}", write the version out, and fill in the hashes.
      octet-draw =
        {
          lib,
          stdenv,
          rustPlatform,
          fetchNpmDeps,
          cargo-tauri,
          nodejs,
          npmHooks,
          pkg-config,
          jq,
          autoPatchelfHook,
          wrapGAppsHook3,
          glib-networking,
          gtk3,
          libsoup_3,
          librsvg,
          webkitgtk_4_1,
          makeFontsConf,
          liberation_ttf,
          xdg-utils,
        }:

        rustPlatform.buildRustPackage (finalAttrs: {
          pname = "octet-draw";
          # Octet's one version is in package.json (tauri.conf.json reads it).
          version = (lib.importJSON ./package.json).version;

          # The repository without what the build does not use, so a change to those files does not rebuild Octet.
          src = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.difference ./. (
              lib.fileset.unions (
                map lib.fileset.maybeMissing [
                  ./.claude
                  ./.github
                  ./flake.nix
                  ./flake.lock
                  ./node_modules
                  ./dist
                  ./src-tauri/target
                ]
              )
            );
          };

          # The page (React + Vite), from package-lock.json. .npmrc already blocks install scripts.
          npmDeps = fetchNpmDeps {
            name = "${finalAttrs.pname}-${finalAttrs.version}-npm-deps";
            inherit (finalAttrs) src;
            hash = "sha256-iA0e+JBzbtGlkuxgQc7RjWlws/eiMSKCfgX6R7K1QTs=";
          };

          # The app (Rust), from src-tauri/Cargo.lock.
          cargoRoot = "src-tauri";
          buildAndTestSubdir = finalAttrs.cargoRoot;
          cargoHash = "sha256-Zi0DYuo/qCsQ38sSp4DlvTkvbETYRObc2xDhCy/+QgM=";

          postPatch = ''
            # Updates come from Nix, not from Octet's own updater: it would try to replace a file in the Nix store.
            # With no endpoints, a check fails at once and goes nowhere. The binary gets the Cargo package's name,
            # so the desktop entry, the Mac app and meta.mainProgram agree. The Mac app is not signed here:
            # Tauri's ad hoc signing calls Apple's codesign, which the build sandbox does not have.
            jq '.plugins.updater.endpoints = []
              | .mainBinaryName = "octet"
              | del(.bundle.macOS.signingIdentity)' \
              src-tauri/tauri.conf.json > tauri.conf.json.new
            mv tauri.conf.json.new src-tauri/tauri.conf.json
          '';

          nativeBuildInputs = [
            # Runs `cargo tauri build` (which runs `npm run build` first) and installs the bundle. Linux: the
            # .deb's /usr, so the binary, desktop entry, icons and the MIME types for .oct, .cdxml and .cdx.
            # macOS: Octet Draw.app in $out/Applications.
            cargo-tauri.hook
            nodejs
            npmHooks.npmConfigHook
            pkg-config
            jq
          ]
          ++ lib.optionals stdenv.hostPlatform.isLinux [
            autoPatchelfHook
            wrapGAppsHook3
          ];

          buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
            glib-networking
            gtk3
            libsoup_3
            librsvg
            webkitgtk_4_1
          ];

          # Feedback is for testers only (src-tauri/build.rs, vite.config.ts). Public releases leave it out.
          env.OCTET_FEEDBACK = "0";

          # TypeScript 7's tsc is a native binary from npm (@typescript/typescript-<os>-<cpu>), linked for a usual
          # Linux. Point it at Nix's loader and libraries before `npm run build` runs it. Only that folder: the
          # rest of node_modules is not in Octet, so the hook is not run over $out.
          dontAutoPatchelf = true;
          preBuild = lib.optionalString stdenv.hostPlatform.isLinux ''
            autoPatchelf node_modules/@typescript
          '';

          # The Rust tests write settings and recent files to $HOME, and the export tests embed a font with
          # Arial's widths (Linux has no Arial). The test that asks PubChem is #[ignore], so no test needs the network.
          preCheck = ''
            export HOME=$(mktemp -d)
          ''
          + lib.optionalString stdenv.hostPlatform.isLinux ''
            export FONTCONFIG_FILE=${makeFontsConf { fontDirectories = [ liberation_ttf ]; }}
          '';

          # Linux: `open` (links, Search PubChem) calls xdg-open. macOS: a command in bin, as on Linux.
          preFixup = lib.optionalString stdenv.hostPlatform.isLinux ''
            gappsWrapperArgs+=(--suffix PATH : ${lib.makeBinPath [ xdg-utils ]})
          '';
          postInstall = lib.optionalString stdenv.hostPlatform.isDarwin ''
            if [ ! -e "$out/bin/octet" ]; then
              mkdir -p "$out/bin"
              ln -s "$out/Applications/Octet Draw.app/Contents/MacOS/octet" "$out/bin/octet"
            fi
          '';

          meta = {
            description = "Draw chemical structures and reactions, and open and save ChemDraw files";
            longDescription = ''
              Octet Draw is a free, open-source app to draw chemical structures and reactions. It opens and saves
              ChemDraw files (CDXML and CDX), and it works with no internet connection.
            '';
            homepage = "https://github.com/SamChemMan/Octet-Draw";
            changelog = "https://github.com/SamChemMan/Octet-Draw/blob/v${finalAttrs.version}/CHANGELOG.md";
            # Octet itself. The licences of what it bundles are in THIRD_PARTY.md and src-tauri/licences/.
            license = lib.licenses.asl20;
            mainProgram = "octet";
            platforms = lib.platforms.linux ++ lib.platforms.darwin;
            maintainers = [ ];
          };
        });
    in
    {
      packages = forAllSystems (pkgs: {
        octet-draw = pkgs.callPackage octet-draw { };
        default = self.packages.${pkgs.stdenv.hostPlatform.system}.octet-draw;
      });

      apps = forAllSystems (pkgs: {
        default = {
          type = "app";
          program = lib.getExe self.packages.${pkgs.stdenv.hostPlatform.system}.default;
        };
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages =
            with pkgs;
            [
              nodejs
              cargo
              rustc
              rustfmt
              clippy
              rust-analyzer
              cargo-tauri
              pkg-config
            ]
            ++ lib.optionals stdenv.hostPlatform.isLinux [
              autoPatchelfHook
              glib-networking
              gtk3
              libsoup_3
              librsvg
              webkitgtk_4_1
              liberation_ttf
              xdg-utils
            ];
          # Linux: what wrapGAppsHook3 gives the package, GTK's settings schemas (the Open and Save dialogs need
          # them) and GLib's network modules. TypeScript 7's native tsc needs Nix's loader: after the first
          # `npm ci`, run `octet-patch-tsc` (or leave the shell and enter it again).
          shellHook = lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''
            export XDG_DATA_DIRS=${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}''${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}
            export GIO_EXTRA_MODULES=${pkgs.glib-networking}/lib/gio/modules''${GIO_EXTRA_MODULES:+:$GIO_EXTRA_MODULES}
            octet-patch-tsc() { autoPatchelf node_modules/@typescript; }
            if [ -d node_modules/@typescript ]; then octet-patch-tsc; fi
          '';
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
