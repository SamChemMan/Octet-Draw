// Name to Structure's online step (decision 0015): when nothing offline reads a name or an InChIKey and Settings >
// Online search is on, the page asks PubChem's PUG REST service for the structure, after the user presses Return.
// Only the typed text goes, to a fixed address. The answer is read as hostile: at most 64 KB, and each line must be
// SMILES and nothing else. The page reads that SMILES with its usual limits.
use std::time::Duration;

use tauri::{AppHandle, Manager};

const BY_NAME: &str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/property/SMILES/TXT";
const BY_KEY: &str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/";
const MOST_TEXT: usize = 300;
const MOST_ANSWER: usize = 64 * 1024;
const MOST_SMILES: usize = 4000;
pub const UNREACHED: &str = "Octet cannot reach PubChem.";
pub const SEVERAL: &str = "PubChem has more than one structure for this name. Type a more exact name.";

// A standard InChIKey: 14 letters, 10 letters and one, with hyphens.
pub fn is_inchikey(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 27 && b[14] == b'-' && b[25] == b'-' && b.iter().enumerate().all(|(i, c)| i == 14 || i == 25 || c.is_ascii_uppercase())
}

// The structure in PubChem's answer: one SMILES a line, one line for each compound with the name. None for no line;
// refused when the lines are not SMILES, or when they give more than one structure.
pub fn structure_of(answer: &str) -> Result<Option<String>, String> {
    let mut found: Option<&str> = None;
    for line in answer.lines().map(str::trim).filter(|l| !l.is_empty()) {
        let smiles = line.len() <= MOST_SMILES && line.bytes().all(|c| c.is_ascii_alphanumeric() || b"@+-[]()=#$:/\\.%*".contains(&c));
        if !smiles {
            return Err(UNREACHED.into());
        }
        match found {
            Some(f) if f != line => return Err(SEVERAL.into()),
            _ => found = Some(line),
        }
    }
    Ok(found.map(String::from))
}

// Runs only when the user presses Return (or ⇧⌘N) on text nothing offline reads.
#[tauri::command]
pub async fn pubchem_structure(app: AppHandle, text: String) -> Result<Option<String>, String> {
    if !*app.state::<crate::search::Online>().0.lock().unwrap() {
        return Err("Online search is off in Settings.".into());
    }
    lookup(text.trim(), &app.package_info().version.to_string()).await
}

// PubChem's structure for a name or InChIKey. version: Octet's, for the user agent.
async fn lookup(text: &str, version: &str) -> Result<Option<String>, String> {
    if text.is_empty() || text.len() > MOST_TEXT || text.chars().any(char::is_control) {
        return Ok(None);
    }
    // The updater installs the same provider; whichever runs first does it.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(format!("Octet Draw {version}"))
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| UNREACHED.to_string())?;
    // A name goes in the body, so no character of it can change the address.
    let request = if is_inchikey(text) {
        client.get(format!("{BY_KEY}{text}/property/SMILES/TXT"))
    } else {
        client.post(BY_NAME).header("Content-Type", "application/x-www-form-urlencoded").body(format!("name={}", crate::search::encode(text)))
    };
    let mut response = request.send().await.map_err(|_| UNREACHED.to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(UNREACHED.into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| UNREACHED.to_string())? {
        body.extend_from_slice(&chunk);
        if body.len() > MOST_ANSWER {
            return Err(UNREACHED.into());
        }
    }
    structure_of(std::str::from_utf8(&body).map_err(|_| UNREACHED.to_string())?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inchikeys() {
        assert!(is_inchikey("BSYNRYMUTXBXSQ-UHFFFAOYSA-N"));
        assert!(!is_inchikey("BSYNRYMUTXBXSQ-UHFFFAOYSA-n"));
        assert!(!is_inchikey("BSYNRYMUTXBXSQ/UHFFFAOYSA-N"));
        assert!(!is_inchikey("aspirin"));
    }

    #[test]
    fn answers_are_smiles_or_refused() {
        assert_eq!(structure_of("CC(=O)OC1=CC=CC=C1C(=O)O\n").unwrap().as_deref(), Some("CC(=O)OC1=CC=CC=C1C(=O)O"));
        assert_eq!(structure_of("C[C@@H](C(=O)O)N\nC[C@@H](C(=O)O)N\n").unwrap().as_deref(), Some("C[C@@H](C(=O)O)N"));
        assert_eq!(structure_of("").unwrap(), None);
        assert_eq!(structure_of("CCO\nCCCO\n").unwrap_err(), SEVERAL);
        assert_eq!(structure_of("<script>alert(1)</script>").unwrap_err(), UNREACHED);
        assert_eq!(structure_of(&"C".repeat(MOST_SMILES + 1)).unwrap_err(), UNREACHED);
    }

    // Asks PubChem itself, so it runs only when asked: cargo test pubchem -- --ignored
    #[test]
    #[ignore]
    fn pubchem_answers() {
        let ask = |t: &str| tauri::async_runtime::block_on(lookup(t, "test"));
        assert_eq!(ask("aspirin").unwrap().as_deref(), Some("CC(=O)OC1=CC=CC=C1C(=O)O"));
        assert_eq!(ask("Tylenol / paracetamol & co").unwrap(), None);
        assert_eq!(ask("BSYNRYMUTXBXSQ-UHFFFAOYSA-N").unwrap().as_deref(), Some("CC(=O)OC1=CC=CC=C1C(=O)O"));
        assert_eq!(ask("qwertyuiopasdf").unwrap(), None);
    }
}
