fn main() {
    // Feedback (src/feedback.rs) is for testers (REL-8). OCTET_FEEDBACK=1 puts it in a build and OCTET_FEEDBACK=0
    // leaves it out; with neither, debug builds have it and release builds do not. vite.config.ts reads the same.
    println!("cargo::rustc-check-cfg=cfg(feedback)");
    println!("cargo::rerun-if-env-changed=OCTET_FEEDBACK");
    let debug = std::env::var("PROFILE").as_deref() == Ok("debug");
    if std::env::var("OCTET_FEEDBACK").map_or(debug, |v| v == "1") {
        println!("cargo::rustc-cfg=feedback");
    }
    tauri_build::build()
}
