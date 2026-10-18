fn main() {
    // Feedback (src/feedback.rs) is for testers (REL-8), so every build has it while friends test Octet.
    // OCTET_FEEDBACK=0 leaves it out: the release workflow sets it for the public release. vite.config.ts reads the
    // same variable.
    println!("cargo::rustc-check-cfg=cfg(feedback)");
    println!("cargo::rerun-if-env-changed=OCTET_FEEDBACK");
    if std::env::var("OCTET_FEEDBACK").as_deref() != Ok("0") {
        println!("cargo::rustc-cfg=feedback");
    }
    tauri_build::build()
}
