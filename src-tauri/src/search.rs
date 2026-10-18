// Search Reaxys and Search PubChem (decision 0008): one press opens the search, with the structure in the address:
// Reaxys in Octet's Reaxys window, PubChem in the user's browser. The page sends only the structure (SMILES, or a
// molfile for a query with generic labels), exact or not, and the reaction role; the addresses are fixed here, so the
// page cannot open any other site. Octet sends nothing else, and Reaxys or PubChem signs the user in.
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const REAXYS: &str = "https://www.reaxys.com/reaxys/secured/hopinto.do";
const PUBCHEM: &str = "https://pubchem.ncbi.nlm.nih.gov/";
// The Reaxys Link-In guide's limit for one address (Firefox's). Windows can cut longer ones too, so PubChem's as well.
const LIMIT: usize = 2000;
const MAX_INPUT: usize = 20_000;
// ChemDraw 26.1 sends these with every Reaxys search, so Octet's searches find what ChemDraw's find.
const OPTIONS: &str = "isotopes,stereo_absolute,salts,charges,radicals,mixtures";
// The parts a structure can take in a reaction: what goes in, what comes out, or either (between two arrows).
const ROLES: [&str; 3] = ["starting_material", "product", "all_reactions"];
pub const TOO_LONG: &str = "This structure is too large for a search link. Select a smaller part.";

// Every byte except a letter or a digit as %XX, so no character of the structure can end a parameter.
fn encode(text: &str) -> String {
    text.bytes().map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

// A Reaxys Link-In address. A role searches reactions (context R) for the structure in that part; without one,
// substances (context S). A molfile goes with each new line as \n, as the guide asks.
pub fn reaxys(smiles: Option<&str>, molfile: Option<&str>, exact: bool, role: Option<&str>, version: &str) -> Result<String, String> {
    let query = match (smiles, molfile) {
        (_, Some(m)) => format!("MOLFILE='{}'", m.replace('\r', "").replace('\n', "\\n")),
        (Some(s), None) => format!("SMILES='{s}'"),
        (None, None) => return Err("Select a structure to search.".into()),
    };
    let role = match role {
        Some(r) if ROLES.contains(&r) => Some(r),
        Some(_) => return Err("Octet has no such search.".into()),
        None => None,
    };
    let context = if role.is_some() { "R" } else { "S" };
    let kind = if exact { "exact" } else { "substructure" };
    let options = role.map_or(format!("{kind},{OPTIONS}"), |r| format!("{r},{kind},{OPTIONS}"));
    let version = encode(version);
    let url = format!("{REAXYS}?context={context}&query={}&options={options}&origin=Octet{version}&ln=", encode(&query));
    if url.len() > LIMIT { Err(TOO_LONG.into()) } else { Ok(url) }
}

// PubChem's structure search for a SMILES: the same structure, or its Substructure tab. The structure goes after
// the #, and PubChem's page sends it on. PubChem does not document this address; check it before each release.
pub fn pubchem(smiles: &str, exact: bool) -> Result<String, String> {
    let url = format!("{PUBCHEM}#query={}&input_type=smiles{}", encode(smiles), if exact { "" } else { "&tab=substructure" });
    if url.len() > LIMIT { Err(TOO_LONG.into()) } else { Ok(url) }
}

// Reaxys's page keeps its Query Builder form (rx2:qbNodesList), and on a link it searches that old form before it
// loads the new structure, so each search showed the one before it (18 October 2026). On a load from a link (the
// site's root, or #/hopinto), this clears the old form before Reaxys's own scripts run.
const FRESH_FORM: &str = r##"if (location.hostname === "www.reaxys.com" && location.pathname === "/" && (!location.hash || location.hash.startsWith("#/hopinto"))) { try { localStorage.removeItem("rx2:qbNodesList"); } catch (e) {} }"##;

// The Reaxys window: one, reused for each search. Reaxys pages have no access to Octet's commands (no capability
// names this window). Sign-in pages of the user's institution are on other sites, so any https page can load here;
// links that open a new window go to the user's browser, and downloads go to Downloads.
fn reaxys_window(app: &AppHandle, url: &str) -> Result<(), String> {
    let url: Url = url.parse().map_err(|_| "Octet has no such search.".to_string())?;
    if let Some(w) = app.get_webview_window("reaxys") {
        w.navigate(url).map_err(|e| e.to_string())?;
        let _ = w.unminimize();
        return w.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(app, "reaxys", WebviewUrl::External(url))
        .title("Reaxys")
        .inner_size(1200.0, 820.0)
        .min_inner_size(640.0, 480.0)
        .initialization_script(FRESH_FORM)
        .on_navigation(|url| matches!(url.scheme(), "https" | "blob" | "about"))
        .on_new_window(|url, _| {
            if url.scheme() == "https" {
                let _ = crate::open_external(url.as_str());
            }
            NewWindowResponse::Deny
        })
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// Settings > Online search: off hides the searches, and this refuses them.
pub struct Online(pub std::sync::Mutex<bool>);

// Runs only when the user presses Search Reaxys or Search PubChem.
#[tauri::command]
pub async fn search_online(app: AppHandle, site: String, smiles: Option<String>, molfile: Option<String>, exact: bool, role: Option<String>) -> Result<(), String> {
    if !*app.state::<Online>().0.lock().unwrap() {
        return Err("Online search is off in Settings.".into());
    }
    if smiles.as_ref().is_some_and(|s| s.len() > MAX_INPUT) || molfile.as_ref().is_some_and(|m| m.len() > MAX_INPUT) {
        return Err(TOO_LONG.into());
    }
    let url = address(&site, smiles.as_deref(), molfile.as_deref(), exact, role.as_deref(), &app.package_info().version.to_string())?;
    if site == "reaxys" {
        return reaxys_window(&app, &url);
    }
    crate::open_external(&url).map_err(|_| "Octet cannot open your browser.".into())
}

// The address for a search on one of the two sites, and no other.
fn address(site: &str, smiles: Option<&str>, molfile: Option<&str>, exact: bool, role: Option<&str>, version: &str) -> Result<String, String> {
    match site {
        "reaxys" => reaxys(smiles, molfile, exact, role, version),
        "pubchem" if molfile.is_some() => Err("PubChem cannot search generic labels such as X or Q.".into()),
        "pubchem" => pubchem(smiles.ok_or("Select a structure to search.")?, exact),
        _ => Err("Octet has no such search.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reaxys_substance_search_as_chemdraw_sends_it() {
        let url = reaxys(Some("CC(=O)Oc1ccccc1C(=O)O"), None, false, None, "0.1.0").unwrap();
        assert_eq!(url, "https://www.reaxys.com/reaxys/secured/hopinto.do?context=S&query=SMILES%3D%27CC%28%3DO%29Oc1ccccc1C%28%3DO%29O%27\
            &options=substructure,isotopes,stereo_absolute,salts,charges,radicals,mixtures&origin=Octet0%2E1%2E0&ln=");
        assert!(reaxys(Some("C"), None, true, None, "0.1.0").unwrap().contains("&options=exact,isotopes,"));
    }

    #[test]
    fn every_reserved_character_is_encoded() {
        // Ring closure %10, triple bond, stereo, charges and a stray & or ' from a hostile page.
        let url = reaxys(Some("C%10#N/[C@@H+]&x='y' z"), None, false, None, "0.1.0").unwrap();
        let query = url.split("&query=").nth(1).unwrap().split("&options=").next().unwrap();
        assert_eq!(query, "SMILES%3D%27C%2510%23N%2F%5BC%40%40H%2B%5D%26x%3D%27y%27%20z%27");
        assert!(query.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'%'));
        assert_eq!(url.matches('&').count(), 4, "{url}");
    }

    #[test]
    fn a_role_searches_reactions() {
        let url = reaxys(Some("CCO"), None, false, Some("product"), "0.1.0").unwrap();
        assert!(url.contains("?context=R&") && url.contains("&options=product,substructure,isotopes,"), "{url}");
        assert!(reaxys(Some("CCO"), None, false, Some("reagent;rm"), "0.1.0").is_err());
    }

    #[test]
    fn a_molfile_goes_with_its_new_lines_as_backslash_n() {
        let url = reaxys(Some("ignored"), Some("Octet\r\n  Octet\n\nM  END\n"), false, None, "0.1.0").unwrap();
        assert!(url.contains("&query=MOLFILE%3D%27Octet%5Cn%20%20Octet%5Cn%5CnM%20%20END%5Cn%27&"), "{url}");
    }

    #[test]
    fn long_addresses_are_refused() {
        assert_eq!(reaxys(Some(&"C".repeat(1900)), None, false, None, "0.1.0").unwrap_err(), TOO_LONG);
        assert_eq!(pubchem(&"C".repeat(1950), true).unwrap_err(), TOO_LONG);
        assert!(reaxys(None, None, false, None, "0.1.0").is_err());
    }

    #[test]
    fn only_the_two_sites() {
        assert!(address("reaxys", Some("C"), None, false, None, "0.1.0").unwrap().starts_with("https://www.reaxys.com/reaxys/secured/hopinto.do?"));
        assert!(address("pubchem", Some("C"), None, true, None, "0.1.0").unwrap().starts_with("https://pubchem.ncbi.nlm.nih.gov/#query="));
        assert!(address("https://example.com", Some("C"), None, true, None, "0.1.0").is_err());
        assert!(address("pubchem", None, Some("Octet\n"), false, None, "0.1.0").is_err(), "PubChem's link takes SMILES only");
    }

    #[test]
    fn the_form_is_cleared_only_on_a_load_from_a_link() {
        assert!(FRESH_FORM.starts_with(r#"if (location.hostname === "www.reaxys.com" && location.pathname === "/""#));
        assert!(FRESH_FORM.contains(r#"localStorage.removeItem("rx2:qbNodesList")"#));
    }

    #[test]
    fn pubchem_identity_or_substructure() {
        assert_eq!(pubchem("C/C=C/C", true).unwrap(), "https://pubchem.ncbi.nlm.nih.gov/#query=C%2FC%3DC%2FC&input_type=smiles");
        assert_eq!(pubchem("CCO", false).unwrap(), "https://pubchem.ncbi.nlm.nih.gov/#query=CCO&input_type=smiles&tab=substructure");
    }
}
