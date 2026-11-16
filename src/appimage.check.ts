// Run: node src/appimage.check.ts. The AppImage's launcher (src-tauri/linux/AppRun, issue 37): when the system has
// WebKitGTK 4.1, Octet loads the system's libraries and GTK's own modules and schemas; else the AppImage's copies, with
// the variables AppImageKit's AppRun set. release.yml puts it where Tauri gets AppRun from, before the build. The
// launcher runs here in a stand-in AppImage, after what Tauri's GTK hook sets, with a stand-in Octet that prints its
// folder, its arguments and its environment.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const yml = read(".github/workflows/release.yml");
const install = yml.indexOf('install -Dm755 src-tauri/linux/AppRun "${XDG_CACHE_HOME:-$HOME/.cache}/tauri/AppRun-x86_64"');
assert.ok(install > 0 && install < yml.indexOf("uses: tauri-apps/tauri-action"), "release.yml gives Tauri the launcher before it builds");
assert.ok(yml.includes('cmp "$app/AppRun.wrapped" "$GITHUB_WORKSPACE/src-tauri/linux/AppRun"'), "release.yml checks that the AppImage has it");

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "octet-appimage-")));
// The runtime's mount by another name ($APPDIR), as when $TMPDIR is a link; AppRun names it by its real path.
const app = join(tmp, "mount"), mount = join(tmp, ".mount_Octet"), system = join(tmp, "system");
mkdirSync(join(app, "usr/bin"), { recursive: true });
mkdirSync(join(system, "lib64"), { recursive: true });
copyFileSync(new URL("../src-tauri/linux/AppRun", import.meta.url), join(app, "AppRun.wrapped"));
writeFileSync(join(app, "usr/bin/octet"), '#!/bin/sh\npwd\nprintf "%s|" "$@"; echo\nenv\n', { mode: 0o755 });
writeFileSync(join(system, "lib64/libwebkit2gtk-4.1.so.0"), "");
spawnSync("ln", ["-s", app, mount]);

const hook = {
  APPDIR: mount,
  GTK_DATA_PREFIX: mount,
  GTK_THEME: "Adwaita:dark",
  XDG_DATA_DIRS: `${mount}/usr/share:/usr/share:/home/u/.local/share`,
  GSETTINGS_SCHEMA_DIR: `${mount}/usr/share/glib-2.0/schemas`,
  GI_TYPELIB_PATH: `${mount}/usr/lib/girepository-1.0`,
  GIO_MODULE_DIR: `${mount}/usr/lib/gio/modules`,
  GTK_EXE_PREFIX: `${mount}//usr`,
  GTK_PATH: `${mount}/usr/lib/gtk-3.0`,
  GTK_IM_MODULE_FILE: `${mount}/usr/lib/gtk-3.0/3.0.0/immodules.cache`,
  GDK_PIXBUF_MODULE_FILE: `${mount}/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache`,
};
const run = (shell: string, vars: Record<string, string>) => {
  const r = spawnSync(shell, [join(mount, "AppRun.wrapped"), "/home/u/a b.cdxml", "--object"], {
    encoding: "utf8", env: { PATH: process.env.PATH!, HOME: "/home/u", ...hook, ...vars },
  });
  assert.equal(r.status, 0, r.stderr);
  const [cwd, args, ...env] = r.stdout.trimEnd().split("\n");
  return { cwd, args, env: Object.fromEntries(env.map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) };
};
const gtk = Object.keys(hook).filter((k) => k !== "APPDIR" && k !== "XDG_DATA_DIRS");
const libs = `${system}/none ${system}/lib64 ${system}/none2 ${system}`;
const appimageKit = ["usr/lib", "usr/lib/i386-linux-gnu", "usr/lib/x86_64-linux-gnu", "usr/lib32", "usr/lib64", "lib",
  "lib/i386-linux-gnu", "lib/x86_64-linux-gnu", "lib32", "lib64"].map((d) => `${app}/${d}/`).join(":");

try {
  for (const shell of ["sh", "dash", "bash"].filter((s) => spawnSync(s, ["-c", ":"]).status === 0)) {
    // The system has WebKitGTK 4.1: its folder and each folder after it that exists, after the user's own.
    let got = run(shell, { OCTET_SYSTEM_LIBS: libs, LD_LIBRARY_PATH: "/opt/mine" });
    assert.equal(got.cwd, join(app, "usr"), `${shell}: Octet starts in usr, as before`);
    assert.equal(got.args, "/home/u/a b.cdxml|--object|", `${shell}: the arguments go to Octet as they are`);
    assert.equal(got.env.LD_LIBRARY_PATH, `/opt/mine:${system}/lib64:${system}`, shell);
    assert.equal(got.env.OCTET_SESSION_LD_LIBRARY_PATH, "/opt/mine", `${shell}: the programs Octet starts get the session's (linux.rs)`);
    for (const k of gtk) assert.equal(got.env[k], undefined, `${shell}: GTK finds its own ${k}`);
    assert.equal(got.env.XDG_DATA_DIRS, "/home/u/.local/share", `${shell}: the user's own data folders`);
    assert.equal(got.env.GST_PLUGIN_SYSTEM_PATH, undefined, shell);
    assert.equal(got.env.APPDIR, mount, `${shell}: Octet knows its AppImage (src-tauri/src/linux.rs)`);
    assert.ok(got.env.PATH.startsWith(`${app}/usr/bin/:`), shell);
    got = run(shell, { OCTET_SYSTEM_LIBS: libs, XDG_DATA_DIRS: `${mount}/usr/share:/usr/share:` });
    assert.equal(got.env.LD_LIBRARY_PATH, `${system}/lib64:${system}`, shell);
    assert.equal(got.env.OCTET_SESSION_LD_LIBRARY_PATH, "", `${shell}: the session has none`);
    assert.equal(got.env.XDG_DATA_DIRS, undefined, `${shell}: no data folders set gives GLib its own`);

    // No WebKitGTK 4.1 in the system, or OCTET_SYSTEM_LIBS empty: the AppImage's copies, as AppImageKit's AppRun.
    for (const vars of [{ OCTET_SYSTEM_LIBS: `${system}/none ${system}` }, { OCTET_SYSTEM_LIBS: "" }]) {
      got = run(shell, vars);
      assert.equal(got.cwd, join(app, "usr"), shell);
      assert.equal(got.env.LD_LIBRARY_PATH, appimageKit, `${shell}: the folders of AppImageKit's AppRun`);
      assert.equal(got.env.OCTET_SESSION_LD_LIBRARY_PATH, "", shell);
      for (const k of gtk.filter((k) => k !== "GSETTINGS_SCHEMA_DIR")) assert.equal(got.env[k], hook[k as keyof typeof hook], shell);
      assert.equal(got.env.GSETTINGS_SCHEMA_DIR, `${app}/usr/share/glib-2.0/schemas/:${mount}/usr/share/glib-2.0/schemas`, shell);
      assert.equal(got.env.XDG_DATA_DIRS, `${app}/usr/share/:${hook.XDG_DATA_DIRS}`, shell);
      assert.equal(got.env.GST_PLUGIN_SYSTEM_PATH_1_0, `${app}/usr/lib/gstreamer-1.0`, shell);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log("appimage: ok");
