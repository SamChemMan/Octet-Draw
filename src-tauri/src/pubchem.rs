// Name to Structure's online step (decision 0015): when nothing offline reads a name or an InChIKey and Settings >
// Online search is on, the page asks PubChem's PUG REST service for the structure, after the user presses Return.
// Only the typed text goes, to a fixed address. The answer is read as hostile: at most 64 KB, and each line must be
// SMILES and nothing else. The page reads that SMILES with its usual limits.
// The Properties panel's CAS row asks the same service for the CAS number of a structure the dictionary does not
// have (decision 0008). Only the structure's InChIKey goes, and only a CAS number with a right check digit comes back.
// The Properties panel's Find hazards (decision 0008) asks it for a structure's GHS classification, by the
// structure's standard InChIKey, and Find suppliers (issue 114) for the compound's chemical vendors.
// Every request waits its turn, at most four a second in the whole app (NCBI asks for no more than five), and Stop
// ends a window's lookup in flight.
use std::collections::HashSet;
use std::future::Future;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::task::{Poll, Waker};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};

const BY_NAME: &str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/property/SMILES/TXT";
const BY_NAME_KEY: &str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/property/InChIKey/TXT";
const BY_KEY: &str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/";
const BY_CID: &str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/";
// PUG View's Source Categories: every depositor of a compound, by category. It takes no filter.
const SOURCES: &str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/categories/compound/";
const COMPOUND: &str = "https://pubchem.ncbi.nlm.nih.gov/compound/";
const SUBSTANCE: &str = "https://pubchem.ncbi.nlm.nih.gov/substance/";
const MOST_TEXT: usize = 300;
const MOST_ANSWER: usize = 64 * 1024;
// A compound's GHS classification: about 115 KB for ethanol or benzene, whose many sources PubChem lists.
const MOST_HAZARDS: usize = 1024 * 1024;
const MOST_SMILES: usize = 4000;
// A compound's depositors: 0.2 MB for aspirin, 5 MB for acetic acid (most of it governments), 18 November 2026.
const MOST_SOURCES: usize = 16 * 1024 * 1024;
// Acetic acid's 5 MB took 27 s on 19 November 2026 (PubChem sends about 200 KB a second); Stop is there for the user
// who does not want to wait.
const SOURCES_TIME: Duration = Duration::from_secs(120);
// A supplier's name, its link and how many suppliers: the longest name seen was 49 characters, the longest link 124.
const MOST_NAME: usize = 120;
const MOST_LINK: usize = 2000;
const MOST_SUPPLIERS: usize = 1000;
pub const UNREACHED: &str = "Octet cannot reach PubChem.";
pub const STOPPED: &str = "Stopped.";
// A request whose time ran out: PubChem answered too slowly, which is not a lost connection.
pub const SLOW: &str = "PubChem is slow to answer. Try again later.";
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

// The first CAS registry number in PubChem's synonyms for a compound, which is its main one: two to seven digits, two
// digits and a check digit, with hyphens, the check digit right. None when there is none.
pub fn cas_in(synonyms: &str) -> Option<String> {
    synonyms.lines().map(str::trim).find(|line| {
        let parts: Vec<&str> = line.split('-').collect();
        let digits: Vec<u32> = line.bytes().filter(u8::is_ascii_digit).map(|c| u32::from(c - b'0')).collect();
        let shape = parts.len() == 3 && (2..=7).contains(&parts[0].len()) && parts[1].len() == 2 && parts[2].len() == 1 && digits.len() + 2 == line.len();
        // The check digit: the other digits from the right, times 1, 2, 3 and so on, added, modulo 10.
        shape && digits[..digits.len() - 1].iter().rev().zip(1..).map(|(d, i)| d * i).sum::<u32>() % 10 == digits[digits.len() - 1]
    }).map(String::from)
}

// Runs only when the user presses Return (or ⇧⌘N) on text nothing offline reads.
#[tauri::command]
pub async fn pubchem_structure(app: AppHandle, text: String) -> Result<Option<String>, String> {
    lookup(text.trim(), &crate::search::online(&app)?).await
}

// The risk assessment's substances written as text nothing offline reads (decision 0008): PubChem's standard
// InChIKey for the text, when PubChem has one compound for it. The key, not a SMILES, comes back, so Octet never
// reads PubChem's structure again its own way (a lone [Mg] would gain hydrogens).
#[tauri::command]
pub async fn pubchem_key(app: AppHandle, text: String) -> Result<Option<String>, String> {
    key_lookup(text.trim(), &crate::search::online(&app)?).await
}

async fn key_lookup(text: &str, version: &str) -> Result<Option<String>, String> {
    if text.is_empty() || text.len() > MOST_TEXT || text.chars().any(char::is_control) {
        return Ok(None);
    }
    // A name goes in the body, so no character of it can change the address.
    let request = client(version)?.post(BY_NAME_KEY).header("Content-Type", "application/x-www-form-urlencoded").body(format!("name={}", crate::search::encode(text)));
    Ok(answer(request, MOST_ANSWER, None).await?.and_then(|t| key_of(&t)))
}

// The InChIKey in PubChem's answer, when it has exactly one.
pub fn key_of(answer: &str) -> Option<String> {
    let keys: Vec<&str> = answer.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    match keys.as_slice() {
        [k] if is_inchikey(k) => Some(k.to_string()),
        _ => None,
    }
}

// Runs for the Properties panel, once for each structure the dictionary has no CAS number for.
#[tauri::command]
pub async fn pubchem_cas(app: AppHandle, key: String) -> Result<Option<String>, String> {
    cas_lookup(&key, &crate::search::online(&app)?).await
}

// The client that asks PubChem. version: Octet's, for the user agent.
fn client(version: &str) -> Result<reqwest::Client, String> {
    // The updater installs the same provider; whichever runs first does it.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent(format!("Octet Draw {version}"))
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| UNREACHED.to_string())
}

// PubChem's answer as text, refused when larger than most bytes or not UTF-8. None when PubChem has nothing (404).
// It waits its turn first (paced). stop: Stop ends it, between chunks or while it waits for one.
async fn answer(request: reqwest::RequestBuilder, most: usize, stop: Option<&Stop>) -> Result<Option<String>, String> {
    until(stop, paced()).await?;
    let mut response = until(stop, request.send()).await?.map_err(failed)?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(UNREACHED.into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = until(stop, response.chunk()).await?.map_err(failed)? {
        body.extend_from_slice(&chunk);
        if body.len() > most {
            return Err(UNREACHED.into());
        }
    }
    String::from_utf8(body).map(Some).map_err(|_| UNREACHED.to_string())
}

// A request's error as the user is told it: SLOW when its time ran out, else UNREACHED.
fn failed(e: reqwest::Error) -> String {
    (if e.is_timeout() { SLOW } else { UNREACHED }).to_string()
}

// The pace: every PubChem request in the app waits until 250 ms after the one before, however many windows ask, so
// Octet sends at most four a second. NCBI's usage policy asks for no more than five a second from one application.
const PACE: Duration = Duration::from_millis(250);
static NEXT: Mutex<Option<Instant>> = Mutex::new(None);

// How long a request that comes now waits, and the next turn after it.
fn turn(next: &mut Option<Instant>, now: Instant) -> Duration {
    let at = next.map_or(now, |n| n.max(now));
    *next = Some(at + PACE);
    at - now
}

async fn paced() {
    let wait = turn(&mut NEXT.lock().unwrap(), Instant::now());
    if !wait.is_zero() {
        let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(wait)).await;
    }
}

// A window's lookup in flight that Stop can end: its window, its kind ("suppliers", "hazards" from the Properties
// panel or "risk" from a risk assessment), whether it is
// stopped, and the task to wake when it is. It leaves the list when the lookup ends.
struct Flight {
    id: u64,
    owner: String,
    kind: String,
    stopped: bool,
    waker: Option<Waker>,
}
static FLIGHTS: Mutex<Vec<Flight>> = Mutex::new(Vec::new());
static FLIGHT_IDS: AtomicU64 = AtomicU64::new(0);

pub struct Stop(u64);

impl Stop {
    fn new(owner: &str, kind: &str) -> Stop {
        let id = FLIGHT_IDS.fetch_add(1, Ordering::Relaxed);
        FLIGHTS.lock().unwrap().push(Flight { id, owner: owner.into(), kind: kind.into(), stopped: false, waker: None });
        Stop(id)
    }

    // True when Stop ended it; else the task waits with this waker.
    fn stopped(&self, waker: &Waker) -> bool {
        let mut all = FLIGHTS.lock().unwrap();
        let Some(f) = all.iter_mut().find(|f| f.id == self.0) else { return true };
        if !f.stopped && !f.waker.as_ref().is_some_and(|w| w.will_wake(waker)) {
            f.waker = Some(waker.clone());
        }
        f.stopped
    }
}

impl Drop for Stop {
    fn drop(&mut self) {
        FLIGHTS.lock().unwrap().retain(|f| f.id != self.0);
    }
}

// Ends a window's lookups of a kind in flight (every kind when kind is None): each wakes and ends with STOPPED.
fn stop_flights(owner: &str, kind: Option<&str>) -> usize {
    let wakers: Vec<Waker> = FLIGHTS.lock().unwrap().iter_mut().filter(|f| f.owner == owner && kind.is_none_or(|k| f.kind == k)).filter_map(|f| {
        f.stopped = true;
        f.waker.take()
    }).collect();
    let count = wakers.len();
    wakers.into_iter().for_each(Waker::wake);
    count
}

// What f gives, or STOPPED as soon as Stop ends the lookup.
async fn until<F: Future>(stop: Option<&Stop>, f: F) -> Result<F::Output, String> {
    let mut f = std::pin::pin!(f);
    std::future::poll_fn(|cx| {
        if stop.is_some_and(|s| s.stopped(cx.waker())) {
            return Poll::Ready(Err(STOPPED.to_string()));
        }
        f.as_mut().poll(cx).map(Ok)
    })
    .await
}

// Stop in the Properties panel, or the panel closing: the window's lookups of that kind end.
#[tauri::command]
pub fn pubchem_stop(window: WebviewWindow, kind: String) {
    stop_flights(window.label(), Some(&kind));
}

// A window closed: its lookups end.
pub fn closed(label: &str) {
    stop_flights(label, None);
}

// PubChem's structure for a name or InChIKey.
async fn lookup(text: &str, version: &str) -> Result<Option<String>, String> {
    if text.is_empty() || text.len() > MOST_TEXT || text.chars().any(char::is_control) {
        return Ok(None);
    }
    let client = client(version)?;
    // A name goes in the body, so no character of it can change the address.
    let request = if is_inchikey(text) {
        client.get(format!("{BY_KEY}{text}/property/SMILES/TXT"))
    } else {
        client.post(BY_NAME).header("Content-Type", "application/x-www-form-urlencoded").body(format!("name={}", crate::search::encode(text)))
    };
    match answer(request, MOST_ANSWER, None).await? {
        Some(text) => structure_of(&text),
        None => Ok(None),
    }
}

// PubChem's CAS number for a compound by its InChIKey. Nothing else can go in the address.
async fn cas_lookup(key: &str, version: &str) -> Result<Option<String>, String> {
    if !is_inchikey(key) {
        return Ok(None);
    }
    Ok(answer(client(version)?.get(format!("{BY_KEY}{key}/synonyms/TXT")), MOST_ANSWER, None).await?.and_then(|text| cas_in(&text)))
}

// The CID in PubChem's answer: its first line, digits only.
pub fn cid_of(answer: &str) -> Option<&str> {
    answer.lines().next().map(str::trim).filter(|c| (1..=12).contains(&c.len()) && c.bytes().all(|b| b.is_ascii_digit()))
}

// Runs only when the user presses Find hazards in the Properties panel (by: "hazards"), whose Stop ends it, or in a
// risk assessment (by: "risk"), which the panel's Stop leaves running.
#[tauri::command]
pub async fn pubchem_hazards(app: AppHandle, window: WebviewWindow, key: String, by: String) -> Result<Option<String>, String> {
    let version = crate::search::online(&app)?;
    let stop = Stop::new(window.label(), if by == "risk" { "risk" } else { "hazards" });
    hazards(&key, &version, Some(&stop)).await
}


// The GHS classification PubChem has for a compound's standard InChIKey, as PubChem's JSON, which the page reads as
// hostile (src/ghs.ts). Only the InChIKey goes, to fixed addresses: first for the compound's CID, then for its GHS
// Classification section. None when PubChem has no compound with the key, or no classification for it.
async fn hazards(key: &str, version: &str, stop: Option<&Stop>) -> Result<Option<String>, String> {
    if !is_inchikey(key) {
        return Ok(None);
    }
    let client = client(version)?;
    let Some(cids) = answer(client.get(format!("{BY_KEY}{key}/cids/TXT")), MOST_ANSWER, stop).await? else {
        return Ok(None);
    };
    let cid = cid_of(&cids).ok_or(UNREACHED)?;
    answer(client.get(format!("{BY_CID}{cid}/JSON?heading=GHS+Classification")), MOST_HAZARDS, stop).await
}

// Find suppliers (issue 114): a compound's chemical vendors in PubChem, as Octet shows them. Each supplier once, A to
// Z, with a link Octet may open (https, checked here). PubChem has no prices, pack sizes or purity, so neither has this.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Supplier {
    pub name: String,
    pub url: String,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Suppliers {
    pub cid: u64,
    pub suppliers: Vec<Supplier>,
}

// PUG View's Source Categories answer, only the parts Octet reads. Any other part is skipped (serde reads it no deeper
// than its nesting limit); a part of the wrong type refuses the whole answer.
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SourcesAnswer {
    source_categories: Categories,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Categories {
    record_number: Option<u64>,
    #[serde(default)]
    categories: Vec<Category>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Category {
    category: Option<String>,
    #[serde(default)]
    sources: Vec<Source>,
}

#[derive(Deserialize)]
struct Source {
    #[serde(rename = "SID")]
    sid: Option<u64>,
    #[serde(rename = "SourceName")]
    name: Option<String>,
    #[serde(rename = "SourceRecordURL")]
    record: Option<String>,
}

// Runs only when the user presses Find suppliers (or chooses it in the Search menu, the Actions panel or the palette),
// and Stop ends it. The links it gives are the only supplier links open_link opens.
#[tauri::command]
pub async fn pubchem_suppliers(app: AppHandle, window: WebviewWindow, key: String) -> Result<Option<Suppliers>, String> {
    let version = crate::search::online(&app)?;
    let stop = Stop::new(window.label(), "suppliers");
    let found = suppliers(&key, &version, Some(&stop)).await?;
    if let Some(f) = &found {
        app.state::<Links>().keep(f.suppliers.iter().map(|s| s.url.clone()));
    }
    Ok(found)
}

// The suppliers PubChem lists for a compound's standard InChIKey. Only the key goes, then the CID PubChem gave, to fixed
// addresses. None when PubChem has no compound with the key; no suppliers when it lists none.
async fn suppliers(key: &str, version: &str, stop: Option<&Stop>) -> Result<Option<Suppliers>, String> {
    if !is_inchikey(key) {
        return Ok(None);
    }
    let client = client(version)?;
    let Some(cids) = answer(client.get(format!("{BY_KEY}{key}/cids/TXT")), MOST_ANSWER, stop).await? else {
        return Ok(None);
    };
    let cid: u64 = cid_of(&cids).and_then(|c| c.parse().ok()).ok_or(UNREACHED)?;
    let request = client.get(format!("{SOURCES}{cid}/JSON")).timeout(SOURCES_TIME);
    let suppliers = match answer(request, MOST_SOURCES, stop).await? {
        Some(json) => suppliers_in(&json, cid)?,
        None => Vec::new(),
    };
    Ok(Some(Suppliers { cid, suppliers }))
}

// The suppliers in PubChem's answer for compound cid, read as hostile: the "Chemical Vendors" category's entries, each
// name cleaned (supplier_name) and once (letter case and spaces aside), with the link of its newest product (the
// largest SID) that has a clean https link (supplier_link); else its PubChem substance page; else the compound's vendor
// section. A to Z, at most MOST_SUPPLIERS.
pub fn suppliers_in(json: &str, cid: u64) -> Result<Vec<Supplier>, String> {
    let answer: SourcesAnswer = serde_json::from_str(json).map_err(|_| UNREACHED.to_string())?;
    if answer.source_categories.record_number.is_some_and(|n| n != cid) {
        return Err(UNREACHED.into());
    }
    // Each supplier, by its name's key: the name and SID of its newest entry, and its newest entry with a clean link.
    struct Found {
        name: String,
        sid: Option<u64>,
        link: Option<(u64, String)>,
    }
    let (mut by, mut at) = (Vec::<Found>::new(), std::collections::HashMap::<String, usize>::new());
    let vendors = answer.source_categories.categories.into_iter().filter(|c| c.category.as_deref() == Some("Chemical Vendors"));
    for source in vendors.flat_map(|c| c.sources) {
        let Some(name) = source.name.as_deref().and_then(supplier_name) else { continue };
        let key: String = name.chars().filter(|c| !c.is_whitespace()).flat_map(char::to_lowercase).collect();
        let k = match at.get(&key) {
            Some(&k) => k,
            None if by.len() < MOST_SUPPLIERS => {
                at.insert(key, by.len());
                by.push(Found { name: name.clone(), sid: source.sid, link: None });
                by.len() - 1
            }
            None => continue,
        };
        let f = &mut by[k];
        if source.sid > f.sid {
            (f.name, f.sid) = (name, source.sid);
        }
        if let Some(link) = source.record.as_deref().and_then(supplier_link).zip(source.sid) {
            if f.link.as_ref().is_none_or(|(had, _)| link.1 > *had) {
                f.link = Some((link.1, link.0));
            }
        }
    }
    let mut out: Vec<Supplier> = by.into_iter().map(|f| {
        let url = f.link.map(|(_, l)| l).or_else(|| f.sid.map(|s| format!("{SUBSTANCE}{s}"))).unwrap_or_else(|| vendors_page(cid));
        Supplier { name: f.name, url }
    }).collect();
    out.sort_by_cached_key(|s| s.name.to_lowercase());
    Ok(out)
}

// A supplier's name as Octet shows it: no control or format characters (bidirectional overrides among them), spaces
// joined, at most MOST_NAME characters. None when nothing is left.
pub fn supplier_name(raw: &str) -> Option<String> {
    let format = |c: char| matches!(c, '\u{AD}' | '\u{61C}' | '\u{180E}' | '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2060}'..='\u{2064}' | '\u{2066}'..='\u{206F}' | '\u{FEFF}' | '\u{FFF9}'..='\u{FFFB}' | '\u{E0000}'..='\u{E007F}');
    let kept: String = raw.chars().take(4 * MOST_NAME).map(|c| if c.is_control() { ' ' } else { c }).filter(|c| !format(*c)).collect();
    let name: String = kept.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(MOST_NAME).collect();
    let name = name.trim_end().to_string();
    (!name.is_empty()).then_some(name)
}

// A supplier's product link, kept only when it is https to a named host (no address, no localhost), with no user name
// or password, at most MOST_LINK characters: in its parsed form (a host in other scripts as its punycode).
pub fn supplier_link(raw: &str) -> Option<String> {
    if raw.len() > MOST_LINK {
        return None;
    }
    let url = tauri::Url::parse(raw.trim()).ok()?;
    let host = url.domain()?;
    let named = host.contains('.') && !host.ends_with('.') && !host.eq_ignore_ascii_case("localhost");
    (url.scheme() == "https" && named && url.username().is_empty() && url.password().is_none() && url.as_str().len() <= MOST_LINK).then(|| url.to_string())
}

// The compound's Chemical Vendors section on PubChem's site (Open in PubChem in the suppliers list).
pub fn vendors_page(cid: u64) -> String {
    format!("{COMPOUND}{cid}#section=Chemical-Vendors")
}

// pubchem-vendors:<cid> from the page: digits only.
pub fn vendors_link(cid: &str) -> Option<String> {
    cid_of(cid).filter(|c| *c == cid).and_then(|c| c.parse().ok()).map(vendors_page)
}

// The supplier links Find suppliers gave this session, for the whole app: open_link opens a supplier: link only when it
// is one of these, exactly. Kept in memory only; at most MOST_LINKS, and the oldest go when there would be more.
const MOST_LINKS: usize = 50_000;
#[derive(Default)]
pub struct Links(Mutex<(HashSet<String>, Vec<String>)>);

impl Links {
    fn keep(&self, urls: impl IntoIterator<Item = String>) {
        let mut held = self.0.lock().unwrap();
        for url in urls {
            if held.0.insert(url.clone()) {
                held.1.push(url);
            }
        }
        let over = held.1.len().saturating_sub(MOST_LINKS);
        for url in held.1.drain(..over).collect::<Vec<_>>() {
            held.0.remove(&url);
        }
    }

    // The link, when Find suppliers gave it.
    pub fn given(&self, url: &str) -> Option<String> {
        self.0.lock().unwrap().0.get(url).cloned()
    }
}

// A compound's Safety and Hazards section on PubChem's site, for a CID (the Properties panel's PubChem CID).
pub fn safety_page(cid: &str) -> Option<String> {
    cid_of(cid).filter(|c| *c == cid).map(|c| format!("https://pubchem.ncbi.nlm.nih.gov/compound/{c}#section=Safety-and-Hazards"))
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

    #[test]
    fn cas_numbers_have_a_right_check_digit() {
        assert_eq!(cas_in("aspirin\n2-acetoxybenzoic acid\n50-78-2\n11126-35-5\n").as_deref(), Some("50-78-2"));
        assert_eq!(cas_in("200-064-1\n50-78-1\n7732-18-5\n").as_deref(), Some("7732-18-5"), "an EC number and a wrong check digit are passed over");
        assert_eq!(cas_in("1-11-1\n12345678-12-1\n50-78-2x\n5O-78-2\n-50-78-2\n").as_deref(), None);
        assert_eq!(cas_in("").as_deref(), None);
    }

    #[test]
    fn cids_and_pages() {
        assert_eq!(cid_of("702\n"), Some("702"));
        assert_eq!(cid_of("702\n1234\n"), Some("702"));
        assert_eq!(cid_of("<html>"), None);
        assert_eq!(cid_of(""), None);
        assert_eq!(cid_of("1234567890123"), None);
        assert_eq!(safety_page("702").as_deref(), Some("https://pubchem.ncbi.nlm.nih.gov/compound/702#section=Safety-and-Hazards"));
        assert_eq!(safety_page("702\nevil"), None);
        assert_eq!(safety_page("702/../x"), None);
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
        let cas = |k: &str| tauri::async_runtime::block_on(cas_lookup(k, "test"));
        assert_eq!(cas("BSYNRYMUTXBXSQ-UHFFFAOYSA-N").unwrap().as_deref(), Some("50-78-2"));
        assert_eq!(cas("aspirin").unwrap(), None);
        let hazards = |k: &str| tauri::async_runtime::block_on(hazards(k, "test", None));
        assert!(hazards("LFQSCWFLJHTTHZ-UHFFFAOYSA-N").unwrap().unwrap().contains("GHS02"), "ethanol is flammable");
        assert_eq!(hazards("AAAAAAAAAAAAAA-UHFFFAOYSA-N").unwrap(), None);
        // A reagent written as text in the risk assessment (Sam, 16 November 2026): its key, then its hazards.
        let key = |t: &str| tauri::async_runtime::block_on(key_lookup(t, "test"));
        assert_eq!(key("Na2S2O8").unwrap().as_deref(), Some("CHQMHPLRPQMAMX-UHFFFAOYSA-L"));
        assert_eq!(key("Mg").unwrap().as_deref(), Some("FYYHWMGAXLPEAU-UHFFFAOYSA-N"), "magnesium, not its hydride");
        assert!(hazards("CHQMHPLRPQMAMX-UHFFFAOYSA-L").unwrap().unwrap().contains("GHS03"), "sodium persulfate is an oxidiser");
        assert_eq!(hazards("HHUNWJWOJPWLNK-UHFFFAOYSA-N").unwrap(), None, "PubChem has no GHS data for methyl 2-methylisonicotinate");
    }

    // Find suppliers against PubChem itself: cargo test pubchem -- --ignored --nocapture
    #[test]
    #[ignore]
    fn pubchem_suppliers_live() {
        let ask = |k: &str| {
            let t = Instant::now();
            let r = tauri::async_runtime::block_on(suppliers(k, "test", None));
            println!("{k}: {:.2} s", t.elapsed().as_secs_f64());
            r
        };
        let aspirin = ask("BSYNRYMUTXBXSQ-UHFFFAOYSA-N").unwrap().unwrap();
        assert_eq!(aspirin.cid, 2244);
        assert!(aspirin.suppliers.len() >= 10, "{} suppliers", aspirin.suppliers.len());
        assert!(aspirin.suppliers.iter().all(|s| s.url.starts_with("https://") && !s.name.is_empty() && s.name.chars().count() <= MOST_NAME));
        println!("aspirin: {} suppliers", aspirin.suppliers.len());
        let acetic = ask("QTBSBXVTEAMEQO-UHFFFAOYSA-N").unwrap().unwrap();
        assert_eq!(acetic.cid, 176);
        println!("acetic acid: {} suppliers", acetic.suppliers.len());
        assert_eq!(ask("AAAAAAAAAAAAAA-UHFFFAOYSA-N").unwrap(), None, "a key PubChem does not have");
        // Stop during acetic acid's 5 MB download: the lookup ends with STOPPED at once.
        let stop = Stop::new("w-live", "suppliers");
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(1500));
            stop_flights("w-live", Some("suppliers"));
        });
        let t = Instant::now();
        assert_eq!(tauri::async_runtime::block_on(suppliers("QTBSBXVTEAMEQO-UHFFFAOYSA-N", "test", Some(&stop))).unwrap_err(), STOPPED);
        println!("stopped after {:.2} s", t.elapsed().as_secs_f64());
        // The pace: six requests at once go 250 ms apart.
        let t = Instant::now();
        let times: Vec<f64> = tauri::async_runtime::block_on(async {
            let mut out = Vec::new();
            for _ in 0..6 {
                paced().await;
                out.push(t.elapsed().as_secs_f64());
            }
            out
        });
        println!("pace: {times:?}");
        assert!(times.windows(2).all(|w| w[1] - w[0] >= 0.24));
    }

    // A made-up PubChem answer: a Chemical Vendors category of these entries (SID, name, product link), and one other
    // category. No PubChem data is kept in the repository.
    fn vendors(cid: u64, entries: &[(u64, &str, Option<&str>)]) -> String {
        let sources: Vec<serde_json::Value> = entries.iter().map(|(sid, name, link)| {
            let mut v = serde_json::json!({ "SID": sid, "SourceName": name, "SourceURL": null, "RegistryID": "X1", "SourceCategories": ["Chemical Vendors"] });
            if let Some(l) = link {
                v["SourceRecordURL"] = serde_json::json!(l);
            }
            v
        }).collect();
        serde_json::json!({ "SourceCategories": { "RecordType": "CID", "RecordNumber": cid, "Categories": [
            { "Category": "Governmental Organizations", "URL": "https://example.org", "Sources": [{ "SID": 9, "SourceName": "EPA", "SourceRecordURL": "https://epa.example.gov/x" }] },
            { "Category": "Chemical Vendors", "URL": "https://example.org", "Sources": sources },
        ] } }).to_string()
    }

    #[test]
    fn suppliers_once_each_a_to_z_with_their_newest_https_link() {
        let json = vendors(2244, &[
            (10, "Sigma-Aldrich", Some("https://www.sigmaaldrich.com/p/10")),
            (30, "sigma-aldrich ", Some("http://www.sigmaaldrich.com/p/30")),
            (20, "Sigma-Aldrich", Some("https://www.sigmaaldrich.com/p/20")),
            (5, "abcr GmbH", Some("https://abcr.example.com/5")),
            (7, "Yuhao Chemical", Some("http://www.chemyuhao.com/50-78-2.html")),
            (8, "Debye", None),
        ]);
        let got = suppliers_in(&json, 2244).unwrap();
        let names: Vec<&str> = got.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["abcr GmbH", "Debye", "sigma-aldrich", "Yuhao Chemical"], "A to Z, each once (case and spaces aside), the newest entry's name; the governments are not vendors");
        assert_eq!(got[2].url, "https://www.sigmaaldrich.com/p/20", "the newest product with an https link");
        assert_eq!(got[3].url, "https://pubchem.ncbi.nlm.nih.gov/substance/7", "an http link goes to the PubChem substance page");
        assert_eq!(got[1].url, "https://pubchem.ncbi.nlm.nih.gov/substance/8", "no link: the substance page");
        assert!(got.iter().all(|s| s.url.starts_with("https://")));
        // No vendor category: no suppliers. Another compound's answer: refused.
        assert_eq!(suppliers_in(r#"{"SourceCategories":{"RecordNumber":702,"Categories":[]}}"#, 702).unwrap(), vec![]);
        assert_eq!(suppliers_in(&json, 702).unwrap_err(), UNREACHED);
        // No SID at all: the compound's vendor section.
        let no_sid = r#"{"SourceCategories":{"Categories":[{"Category":"Chemical Vendors","Sources":[{"SourceName":"Odd"}]}]}}"#;
        assert_eq!(suppliers_in(no_sid, 5).unwrap()[0].url, "https://pubchem.ncbi.nlm.nih.gov/compound/5#section=Chemical-Vendors");
    }

    #[test]
    fn hostile_answers_are_refused() {
        // Wrong types, not JSON, empty, nesting 200 deep: refused, nothing kept.
        for bad in [
            r#"{"SourceCategories":{"Categories":[{"Category":"Chemical Vendors","Sources":[{"SID":"12","SourceName":"A"}]}]}}"#,
            r#"{"SourceCategories":{"Categories":[{"Category":"Chemical Vendors","Sources":[{"SID":12,"SourceName":5}]}]}}"#,
            r#"{"SourceCategories":{"Categories":{}}}"#,
            r#"{"SourceCategories":[]}"#,
            "<html><body>503 Service Unavailable</body></html>",
            "",
        ] {
            assert_eq!(suppliers_in(bad, 1).unwrap_err(), UNREACHED, "{bad}");
        }
        // Nesting 200 deep where Octet reads: refused. 100 000 deep in a part it skips: skipped (serde skips without
        // recursion), so no stack runs out.
        let deep = format!(r#"{{"SourceCategories":{{"Categories":{}{}}}}}"#, "[".repeat(200), "]".repeat(200));
        assert_eq!(suppliers_in(&deep, 1).unwrap_err(), UNREACHED);
        let skipped = format!(r#"{{"SourceCategories":{{"Categories":[],"X":{}{}}}}}"#, "[".repeat(100_000), "]".repeat(100_000));
        assert_eq!(suppliers_in(&skipped, 1).unwrap(), vec![]);
        // 2000 suppliers: 1000 kept.
        let many: Vec<(u64, String)> = (0..2000).map(|k| (k, format!("Supplier {k:04}"))).collect();
        let entries: Vec<(u64, &str, Option<&str>)> = many.iter().map(|(k, n)| (*k, n.as_str(), None)).collect();
        assert_eq!(suppliers_in(&vendors(1, &entries), 1).unwrap().len(), MOST_SUPPLIERS);
    }

    // A server on this computer that answers once with this status and body, sent in chunks of 64 KB with `gap`
    // between them: PubChem down, a huge or broken answer, a slow network. Its address.
    fn serve(status: &'static str, body: Vec<u8>, gap: Duration) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let at = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let Ok((mut s, _)) = listener.accept() else { return };
            let _ = s.read(&mut [0u8; 4096]);
            let _ = write!(s, "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: application/json\r\n\r\n", body.len());
            for chunk in body.chunks(64 * 1024) {
                if s.write_all(chunk).is_err() {
                    return;
                }
                std::thread::sleep(gap);
            }
        });
        format!("http://{at}/")
    }

    #[test]
    fn answers_too_large_broken_slow_or_stopped() {
        let get = |url: String, most: usize, stop: Option<&Stop>, time: Duration| tauri::async_runtime::block_on(answer(client("test").unwrap().get(url).timeout(time), most, stop));
        let t = Duration::from_secs(10);
        assert_eq!(get(serve("200 OK", b"{}".to_vec(), Duration::ZERO), MOST_SOURCES, None, t).unwrap().as_deref(), Some("{}"));
        // 17 MB: refused once 16 MB have come.
        assert_eq!(get(serve("200 OK", vec![b' '; 17 << 20], Duration::ZERO), MOST_SOURCES, None, t).unwrap_err(), UNREACHED);
        assert_eq!(get(serve("503 Service Unavailable", b"<html>busy</html>".to_vec(), Duration::ZERO), MOST_SOURCES, None, t).unwrap_err(), UNREACHED, "throttled or down");
        assert_eq!(get(serve("500 Internal Server Error", Vec::new(), Duration::ZERO), MOST_SOURCES, None, t).unwrap_err(), UNREACHED);
        assert_eq!(get(serve("404 Not Found", b"{}".to_vec(), Duration::ZERO), MOST_SOURCES, None, t).unwrap(), None, "no such compound");
        assert_eq!(get(serve("200 OK", vec![0xff, 0xfe, 0x00], Duration::ZERO), MOST_SOURCES, None, t).unwrap_err(), UNREACHED, "not UTF-8");
        // A slow network: the time runs out, and the user is told PubChem is slow, not that it cannot be reached.
        assert_eq!(get(serve("200 OK", vec![b' '; 1 << 20], Duration::from_millis(200)), MOST_SOURCES, None, Duration::from_millis(500)).unwrap_err(), SLOW);
        // No server at all: a lost connection.
        let gone = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap();
        assert_eq!(get(format!("http://{gone}/"), MOST_SOURCES, None, t).unwrap_err(), UNREACHED);
        // Stop during a slow download: it ends within a chunk.
        let stop = Stop::new("w-test-serve", "suppliers");
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(400));
            stop_flights("w-test-serve", Some("suppliers"));
        });
        let start = Instant::now();
        assert_eq!(get(serve("200 OK", vec![b' '; 4 << 20], Duration::from_millis(100)), MOST_SOURCES, Some(&stop), t).unwrap_err(), STOPPED);
        assert!(start.elapsed() < Duration::from_secs(2), "{:?}", start.elapsed());
    }

    #[test]
    fn supplier_names_are_plain_text() {
        assert_eq!(supplier_name("  Sigma-Aldrich\n\t Co. ").as_deref(), Some("Sigma-Aldrich Co."));
        assert_eq!(supplier_name("Evil\u{202E}lacimehC").as_deref(), Some("EvillacimehC"), "a right-to-left override goes");
        assert_eq!(supplier_name("A\u{200B}B\u{FEFF}C\u{0007}D").as_deref(), Some("ABC D"));
        assert_eq!(supplier_name("<img src=x onerror=alert(1)>").as_deref(), Some("<img src=x onerror=alert(1)>"), "kept as text: the page shows it as text");
        assert_eq!(supplier_name(&"x".repeat(10_000)).unwrap().chars().count(), MOST_NAME);
        assert_eq!(supplier_name("   \u{202E} \n"), None);
        assert_eq!(supplier_name(""), None);
    }

    #[test]
    fn supplier_links_are_clean_https_only() {
        assert_eq!(supplier_link("https://www.sigmaaldrich.com/GB/en/product/sial/a5376?a=1&b=2#x").as_deref(), Some("https://www.sigmaaldrich.com/GB/en/product/sial/a5376?a=1&b=2#x"));
        assert_eq!(supplier_link("https://bücher.example/p a").as_deref(), Some("https://xn--bcher-kva.example/p%20a"), "parsed form: punycode host, escaped space");
        for bad in [
            "javascript:alert(1)", "file:///etc/passwd", "data:text/html,<script>alert(1)</script>", "http://www.sigmaaldrich.com/",
            "https://user:pass@www.example.com/", "https://user@www.example.com/", "https://127.0.0.1/admin", "https://localhost/", "https://[::1]/",
            "https://intranet/", "HTTPS:", "", "https://", "vbscript:x", "ftp://example.com/a",
        ] {
            assert_eq!(supplier_link(bad), None, "{bad}");
        }
        assert_eq!(supplier_link(&format!("https://example.com/{}", "a".repeat(3000))), None, "3000 characters");
    }

    #[test]
    fn only_links_find_suppliers_gave_open() {
        let links = Links::default();
        links.keep(["https://www.example.com/p?a=1&b=2".to_string()]);
        assert_eq!(links.given("https://www.example.com/p?a=1&b=2").as_deref(), Some("https://www.example.com/p?a=1&b=2"));
        for bad in ["https://www.example.com/p?a=1&b=3", "https://www.example.com/p?a=1&b=2 ", "javascript:alert(1)", "file:///etc/passwd", "data:,x", "http://www.example.com/p?a=1&b=2", "https://u:p@www.example.com/p?a=1&b=2"] {
            assert_eq!(links.given(bad), None, "{bad}");
        }
        // At most MOST_LINKS: the oldest go.
        links.keep((0..MOST_LINKS).map(|k| format!("https://e.example.com/{k}")));
        assert_eq!(links.given("https://www.example.com/p?a=1&b=2"), None);
        assert!(links.given(&format!("https://e.example.com/{}", MOST_LINKS - 1)).is_some());
        assert_eq!(vendors_link("2244").as_deref(), Some("https://pubchem.ncbi.nlm.nih.gov/compound/2244#section=Chemical-Vendors"));
        assert_eq!(vendors_link("2244#x"), None);
        assert_eq!(vendors_link("javascript:1"), None);
    }

    #[test]
    fn the_pace_is_four_a_second() {
        let t = Instant::now();
        let mut next = None;
        assert_eq!(turn(&mut next, t), Duration::ZERO, "the first goes at once");
        assert_eq!(turn(&mut next, t), PACE, "the next waits its turn");
        assert_eq!(turn(&mut next, t + Duration::from_millis(100)), 2 * PACE - Duration::from_millis(100));
        assert_eq!(turn(&mut next, t + Duration::from_secs(5)), Duration::ZERO, "after a pause, at once again");
        // Ten at once: the last waits 2.25 s, so no second has more than four.
        let mut next = None;
        let waits: Vec<Duration> = (0..10).map(|_| turn(&mut next, t)).collect();
        assert_eq!(waits[9], 9 * PACE);
        assert!((0..10).all(|k| waits.iter().filter(|w| **w >= k * PACE / 1 && **w < k * PACE + Duration::from_secs(1)).count() <= 4));
    }

    #[test]
    fn stop_ends_a_windows_lookup_of_its_kind() {
        let run = |stop: &Stop| tauri::async_runtime::block_on(until(Some(stop), std::future::pending::<()>()));
        let (a, b, c) = (Stop::new("w-test-1", "suppliers"), Stop::new("w-test-1", "hazards"), Stop::new("w-test-2", "suppliers"));
        assert_eq!(stop_flights("w-test-1", Some("suppliers")), 0, "nothing waits yet: no waker to wake, but it is stopped");
        assert_eq!(run(&a).unwrap_err(), STOPPED);
        // The others go on: a pending future with no stop never ends, so poll it once.
        let poll_once = |stop: &Stop| {
            let waker = Waker::noop();
            let mut cx = std::task::Context::from_waker(waker);
            let mut f = std::pin::pin!(until(Some(stop), std::future::pending::<()>()));
            f.as_mut().poll(&mut cx).is_pending()
        };
        // A risk assessment's hazards: the Properties panel's Stop leaves it running.
        let risk = Stop::new("w-test-1", "risk");
        assert!(poll_once(&b) && poll_once(&c) && poll_once(&risk));
        assert_eq!(stop_flights("w-test-1", Some("hazards")), 1, "b waits with its waker");
        assert!(!poll_once(&b));
        assert!(poll_once(&risk));
        closed("w-test-2");
        assert!(!poll_once(&c));
        // A finished lookup leaves the list.
        drop((a, b, c, risk));
        assert!(FLIGHTS.lock().unwrap().iter().all(|f| !f.owner.starts_with("w-test-")));
        // A lookup with nothing to stop it runs to its end.
        assert_eq!(tauri::async_runtime::block_on(until(None, async { 7 })).unwrap(), 7);
    }

    #[test]
    fn keys_from_names() {
        assert_eq!(key_of("CHQMHPLRPQMAMX-UHFFFAOYSA-L\n").as_deref(), Some("CHQMHPLRPQMAMX-UHFFFAOYSA-L"));
        assert_eq!(key_of("CHQMHPLRPQMAMX-UHFFFAOYSA-L\nFYYHWMGAXLPEAU-UHFFFAOYSA-N\n"), None, "more than one compound");
        assert_eq!(key_of("<html>"), None);
    }
}
