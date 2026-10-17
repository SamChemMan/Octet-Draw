// Run: node src/names.check.ts. Name to structure: Octet's own name tables (common.ts, drugs.ts), salts, adducts and
// mixtures, the test for SMILES by its look, and 200 common drug and reagent names against their standard InChIKeys
// (reference keys from PubChem, 17 October 2026; not shipped). Before the names in drugs.ts and the reagent formulas,
// and while paste read text as SMILES first, 62 of the 200 gave the right structure, 7 a wrong one ("aspirin" drew
// H3NPS) and 129 none.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { COMMON, commonKey } from "./common.ts";
import { DRUGS } from "./drugs.ts";
import { attachOpsin, knownName, looksLikeSmiles, nameToSmiles } from "./names.ts";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("names.check: skipped (no OPSIN build)"); process.exit(0); }
const pack = readFileSync(new URL("opsin-data.bin", dir));
const files = new Map<string, Int8Array>();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
(globalThis as { opsinResource?: unknown }).opsinResource = (name: string) => files.get(name) ?? null;
const opsin = await import(new URL("opsin.js", dir).href);
opsin.init();
const index: Record<string, string> = JSON.parse(readFileSync(new URL("./nameindex.json", import.meta.url), "utf8"));
attachOpsin(opsin, readFileSync(new URL("names.txt", dir), "utf8"), index);
const indigo = await (await import(new URL("../node_modules/indigo-ketcher/indigo-ketcher-norender.js", import.meta.url).href)).default();
const options = (kv: Record<string, string> = {}) => { const o = new indigo.MapStringString(); for (const [k, v] of Object.entries(kv)) o.set(k, v); return o; };
// What the app draws for SMILES: Indigo's layout, Kekulé bonds (chem.ts, parseStructure).
const drawn = (smiles: string) => {
  const o = options({ "output-content-type": "application/json", "dearomatize-on-load": "true" });
  try { return JSON.parse(indigo.layout(smiles, "ket", o)).struct as string; } finally { o.delete(); }
};
const inchiKey = (s: string) => { const o = options(); try { return indigo.convert(s, "inchi-key", o).trim() as string; } catch { return undefined; } finally { o.delete(); } };
const keyOf = (smiles: string) => inchiKey(drawn(smiles));
const partKeys = (smiles: string) => smiles.split(".").map(keyOf).sort();

// Text that looks like SMILES, and text that does not (Indigo would read "aspirin" and "spiro" as query atoms).
for (const t of ["CCO", "c1ccccc1", "C[C@@H](N)C(=O)O", "OC(=O)c1ccccc1OC(C)=O", "[Na+].[Cl-]", "InChI=1S/CH4/h1H4", "CC>>CO", "C1CC1 |$_R1;;$|"])
  assert.ok(looksLikeSmiles(t), `${t} looks like SMILES`);
for (const t of ["aspirin", "spiro", "ethyl acetate", "Pd(PPh3)4", "2-methylpropane", "caffeine", "Et3N·HCl"]) assert.ok(!looksLikeSmiles(t), `${t} does not look like SMILES`);
assert.equal(nameToSmiles("spiro"), undefined);

// Every entry reads, keeps no aromatic bond once Indigo has drawn it (so the app's formula and mass work), and
// every "=name" points to an entry. No key is in both tables.
const entries: [string, string][] = [
  ...Object.entries(COMMON).map(([k, v]): [string, string] => { const w = v.startsWith("=") ? COMMON[v.slice(1)] ?? "" : v; return [k, w.startsWith("smiles:") ? w.slice(7) : opsin.parseToSmiles(w) ?? ""]; }),
  ...Object.entries(DRUGS).map(([k, v]): [string, string] => [k, v.startsWith("=") ? DRUGS[v.slice(1)] ?? "" : v]),
];
for (const [k, smiles] of entries) {
  assert.ok(smiles && !smiles.startsWith("="), `${k} reads`);
  const ket = JSON.parse(drawn(smiles));
  const aromatic = ket.root.nodes.some(({ $ref }: { $ref: string }) => ket[$ref]?.bonds?.some((b: { type: number }) => b.type === 4));
  assert.ok(!aromatic, `${k} draws with Kekulé bonds`);
  assert.ok(nameToSmiles(k), `${k} reads through nameToSmiles`);
}
const shared = Object.keys(DRUGS).filter((k) => Object.keys(COMMON).some((c) => commonKey(c) === commonKey(k)));
assert.deepEqual(shared, [], "a name in both common.ts and drugs.ts");

// Salts, adducts, hydrates and mixtures read in parts. A whole-number ratio draws that many of each part, as OPSIN
// does; another ratio draws each part once.
const ethanol = keyOf("CCO"), water = keyOf("O");
for (const name of ["2:1 mixture of ethanol and water", "a 2:1 mixture of ethanol and water", "ethanol and water (2:1)", "EtOH/H2O 2:1"])
  assert.deepEqual(partKeys(nameToSmiles(name) ?? ""), [ethanol, ethanol, water].sort(), name);
for (const name of ["EtOH/H2O", "ethanol--water (0.72/0.28)", "ethanol + water", "ethanol–water", "mixture of ethanol and water"])
  assert.deepEqual(partKeys(nameToSmiles(name) ?? ""), [ethanol, water].sort(), name);
assert.deepEqual(partKeys(nameToSmiles("CuSO4·5H2O") ?? ""), partKeys(`${COMMON.CuSO4.slice(7)}.O.O.O.O.O`), "CuSO4·5H2O");
assert.deepEqual(partKeys(nameToSmiles("sertraline hydrochloride") ?? ""), partKeys(`${DRUGS.sertraline}.Cl`), "sertraline hydrochloride");
assert.deepEqual(partKeys(nameToSmiles("EDC·HCl") ?? ""), partKeys(`${opsin.parseToSmiles(COMMON.EDC)}.Cl`), "EDC·HCl");
assert.equal(nameToSmiles("ethanol and unobtainium"), undefined);

// The index of Octet's own names for Structure to Name is up to date (tools/names/index.mjs), and each name in it
// reads back as its structure.
const { build } = await import(new URL("../tools/names/index.mjs", import.meta.url).href);
assert.deepEqual(build(), index, "src/nameindex.json is out of date: run node tools/names/index.mjs");
const inchi = (smiles: string) => { const o = options(); try { return indigo.convert(smiles, "inchi", o).trim() as string; } finally { o.delete(); } };
for (const [key, name] of Object.entries(index)) assert.equal(inchi(nameToSmiles(name) ?? ""), key, `${name} reads back`);
assert.equal(knownName(inchi(DRUGS.imatinib)), "imatinib");
assert.equal(knownName(inchi(opsin.parseToSmiles(COMMON.DBU))), COMMON.DBU);

// 200 common drug and reagent names, with the standard InChIKey of the structure each should give. PCC and
// Wilkinson's catalyst are drawn as Octet draws them (pyridinium chlorochromate as an ion pair, Rh bonded to Cl),
// where PubChem keeps PCC as pyridine, CrO3 and HCl and Wilkinson's chloride apart.
const WANT: Record<string, string> = {
  "aspirin": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N", "paracetamol": "RZVAJINKPMORJF-UHFFFAOYSA-N",
  "acetaminophen": "RZVAJINKPMORJF-UHFFFAOYSA-N", "ibuprofen": "HEFNNWSXXWATRW-UHFFFAOYSA-N",
  "naproxen": "CMWTZPSULFXXJA-VIFPVBQESA-N", "diclofenac": "DCOPUUMXTXDBNB-UHFFFAOYSA-N",
  "celecoxib": "RZEKVGVHFLEQIL-UHFFFAOYSA-N", "indomethacin": "CGIGDMFJXJATDK-UHFFFAOYSA-N",
  "ketoprofen": "DKYWVDODHFEZIM-UHFFFAOYSA-N", "meloxicam": "ZRVUJXDFFKFLMG-UHFFFAOYSA-N",
  "caffeine": "RYYVLZVUVIJVGH-UHFFFAOYSA-N", "nicotine": "SNICXCGAKADSCV-JTQLQIEISA-N",
  "morphine": "BQJCRHHNABKAKU-KBQPJGBKSA-N", "codeine": "OROGSEYTTFOCAN-DNJOTXNNSA-N",
  "oxycodone": "BRUQQQPBMZOVGD-XFKAJCMBSA-N", "hydrocodone": "LLPOLZWFYMWNKH-CMKMFDCUSA-N",
  "fentanyl": "PJMPHNIQZUBGLI-UHFFFAOYSA-N", "tramadol": "TVYLLZQTGLZFBW-ZBFHGGJFSA-N",
  "methadone": "USSIQXCVUWKGNF-UHFFFAOYSA-N", "naloxone": "UZHSEJADLWPNLE-GRGSLBFTSA-N",
  "cocaine": "ZPUCINDJVBIVPJ-LJISPDSOSA-N", "lidocaine": "NNJVILVZKWQKPM-UHFFFAOYSA-N",
  "procaine": "MFDFERRIHVXMIY-UHFFFAOYSA-N", "benzocaine": "BLFLLBZGZJTVJG-UHFFFAOYSA-N",
  "bupivacaine": "LEBVLXFERQHONN-UHFFFAOYSA-N", "amoxicillin": "LSQZJLSUYDQPKJ-NJBDSQKTSA-N",
  "ampicillin": "AVKUERGKIZMTKX-NJBDSQKTSA-N", "penicillin G": "JGSARLDLIJGVTE-MBNYWOFBSA-N",
  "cefalexin": "ZAIPMKNFIOOWCQ-UEKVPHQBSA-N", "ciprofloxacin": "MYSWGUAQZAJSOK-UHFFFAOYSA-N",
  "levofloxacin": "GSDSWSVVBLHKDQ-JTQLQIEISA-N", "doxycycline": "SGKRLCUYIXIAHR-AKNGSSGZSA-N",
  "tetracycline": "NWXMGUDVXFXRIG-WESIUVDSSA-N", "metronidazole": "VAOCPAMSLUNLGC-UHFFFAOYSA-N",
  "trimethoprim": "IEDVJHCEMCRBQM-UHFFFAOYSA-N", "sulfamethoxazole": "JLKIGFTWXXRPMT-UHFFFAOYSA-N",
  "chloramphenicol": "WIIZWVCIJKGZOK-RKDXNWHRSA-N", "isoniazid": "QRXWMOHMRWLFEY-UHFFFAOYSA-N",
  "linezolid": "TYZROVQLWOKYKF-ZDUSSCGKSA-N", "fluconazole": "RFHAOTPXVQNOHP-UHFFFAOYSA-N",
  "aciclovir": "MKUXAQIIEYXACX-UHFFFAOYSA-N", "oseltamivir": "VSZGPKBBMSAYNT-RRFJBIMHSA-N",
  "zidovudine": "HBOMLICNUCNMMY-XLPZGREQSA-N", "atorvastatin": "XUKUURHRXDUEBC-KAYWLYCHSA-N",
  "simvastatin": "RYMZZMVNJRMUDD-HGQWONQESA-N", "rosuvastatin": "BPRHUIZQVSMCRT-VEUZHWNKSA-N",
  "pravastatin": "TUZYXOIXSAXUGO-PZAWKZKUSA-N", "lovastatin": "PCZOHLXUXFIOCF-BXMDZJJMSA-N",
  "metformin": "XZWYZXLIPXDOLR-UHFFFAOYSA-N", "glipizide": "ZJJXGWJIGJFDTL-UHFFFAOYSA-N",
  "glibenclamide": "ZNNLBTZKUZBEKO-UHFFFAOYSA-N", "sitagliptin": "MFFMDFFZMYYVKS-SECBINFHSA-N",
  "pioglitazone": "HYAFETHFCAUJAY-UHFFFAOYSA-N", "lisinopril": "RLAWWYSOJDYHDC-BZSNNMDCSA-N",
  "enalapril": "GBXSMTUPTTWBMN-XIRDDKMYSA-N", "captopril": "FAKRSMQSSFJEIM-RQJHMYQMSA-N",
  "ramipril": "HDACQVRGBOVJII-JBDAPHQKSA-N", "losartan": "PSIFNNKUMBGKDQ-UHFFFAOYSA-N",
  "valsartan": "ACWBQPMHZXGDFX-QFIPXVFZSA-N", "amlodipine": "HTIQEAQVCYTUBX-UHFFFAOYSA-N",
  "nifedipine": "HYIMSNHJOBLJNT-UHFFFAOYSA-N", "diltiazem": "HSUGRBWQSSZJOP-RTWAWAEBSA-N",
  "verapamil": "SGTNSNPWRIOYBX-UHFFFAOYSA-N", "metoprolol": "IUBSYMUCCVWXPE-UHFFFAOYSA-N",
  "atenolol": "METKIMKYRPQLGS-UHFFFAOYSA-N", "propranolol": "AQHHHDLHHXJYJD-UHFFFAOYSA-N",
  "carvedilol": "OGHNVEJMJSYVRP-UHFFFAOYSA-N", "bisoprolol": "VHYCDWMUTMEGQY-UHFFFAOYSA-N",
  "hydrochlorothiazide": "JZUFKLXOESDKRF-UHFFFAOYSA-N", "furosemide": "ZZUFCTLCJUWOSV-UHFFFAOYSA-N",
  "spironolactone": "LXMSZDCAJNLERA-ZHYRCANASA-N", "warfarin": "PJVWKTKQMONHTI-UHFFFAOYSA-N",
  "clopidogrel": "GKTWGGQPFAXNFI-HNNXBMFYSA-N", "apixaban": "QNZCBYKSOIHPEH-UHFFFAOYSA-N",
  "rivaroxaban": "KGFYHTZWPPHNLQ-AWEZNQCLSA-N", "omeprazole": "SUBDBMMJDZJVOS-UHFFFAOYSA-N",
  "esomeprazole": "SUBDBMMJDZJVOS-DEOSSOPVSA-N", "lansoprazole": "MJIHNNLFOKEZEW-UHFFFAOYSA-N",
  "pantoprazole": "IQPSEEYGBUAQFF-UHFFFAOYSA-N", "ranitidine": "VMXUWOKSQNHOCA-UKTHLTGXSA-N",
  "famotidine": "XUFQPHANEAPEMJ-UHFFFAOYSA-N", "sertraline": "VGKDLMBJGBXTGI-SJCJKPOMSA-N",
  "fluoxetine": "RTHCYVBBDHJXIQ-UHFFFAOYSA-N", "paroxetine": "AHOUBRCZNHFOSL-YOEHRIQHSA-N",
  "citalopram": "WSEQXVZVJXJVFP-UHFFFAOYSA-N", "escitalopram": "WSEQXVZVJXJVFP-FQEVSTJZSA-N",
  "venlafaxine": "PNVNVHUZROJLTJ-UHFFFAOYSA-N", "duloxetine": "ZEUITGRIYCTCEM-KRWDZBQOSA-N",
  "bupropion": "SNPPWIUOZRMYNY-UHFFFAOYSA-N", "amitriptyline": "KRMDCWKBEZIMAB-UHFFFAOYSA-N",
  "imipramine": "BCGWQEUPMDMJNV-UHFFFAOYSA-N", "mirtazapine": "RONZAEMNMFQXRA-UHFFFAOYSA-N",
  "trazodone": "PHLBKPHSAVXXEF-UHFFFAOYSA-N", "diazepam": "AAOVKJBEBIDNHE-UHFFFAOYSA-N",
  "alprazolam": "VREFGVBLTWBCJP-UHFFFAOYSA-N", "lorazepam": "DIWRORZWFLOCLC-UHFFFAOYSA-N",
  "clonazepam": "DGBIGWXXNGSACT-UHFFFAOYSA-N", "midazolam": "DDLIGBOFAVUZHB-UHFFFAOYSA-N",
  "zolpidem": "ZAFYATHCZYHLPB-UHFFFAOYSA-N", "haloperidol": "LNEPOXFFQSENCJ-UHFFFAOYSA-N",
  "chlorpromazine": "ZPEIMTDSQAKGNT-UHFFFAOYSA-N", "olanzapine": "KVWDHTXUZHCGIO-UHFFFAOYSA-N",
  "quetiapine": "URKOMYMAXPYINW-UHFFFAOYSA-N", "risperidone": "RAPZEAPATHNIPO-UHFFFAOYSA-N",
  "aripiprazole": "CEUORZQYGODEFX-UHFFFAOYSA-N", "clozapine": "QZUDBNBUXVUHMW-UHFFFAOYSA-N",
  "levothyroxine": "XUIIKFGFIJCVMT-LBPRGKRZSA-N", "prednisolone": "OIGNJSKKLXVSLS-VWUMJDOOSA-N",
  "prednisone": "XOFYZVNMUHMLCC-ZPOLXVRWSA-N", "dexamethasone": "UREBDLICKHMUKA-CXSFZGCWSA-N",
  "hydrocortisone": "JYGXADMDTFJGBT-VWUMJDOOSA-N", "testosterone": "MUMGGOZAMZWBJJ-DYKIIFRCSA-N",
  "estradiol": "VOXZDWNPVJITMN-ZBRFXRBCSA-N", "progesterone": "RJKFOVLPORLFTN-LEKSSAKUSA-N",
  "sildenafil": "BNRNXUUZRGQAQC-UHFFFAOYSA-N", "tadalafil": "WOXKDUGGOYFFRN-IIBYNOLFSA-N",
  "salbutamol": "NDAUXUAQIAJITI-UHFFFAOYSA-N", "loratadine": "JCCNYMKQOSZNPW-UHFFFAOYSA-N",
  "cetirizine": "ZKLPARSLTMPFCP-UHFFFAOYSA-N", "diphenhydramine": "ZZVUWRFHKOJYTH-UHFFFAOYSA-N",
  "gabapentin": "UGJMXCAKCUNAIE-UHFFFAOYSA-N", "pregabalin": "AYXYPKUFHZROOJ-ZETCQYMHSA-N",
  "levetiracetam": "HPHUVLMMVZITSG-LURJTMIESA-N", "carbamazepine": "FFGPTBGBLSHEPO-UHFFFAOYSA-N",
  "phenytoin": "CXOFVDLJLONNDW-UHFFFAOYSA-N", "valproic acid": "NIJJYAXOARWZEE-UHFFFAOYSA-N",
  "lamotrigine": "PYZRQGJRPPTADH-UHFFFAOYSA-N", "donepezil": "ADEBPBSSDYVVLD-UHFFFAOYSA-N",
  "levodopa": "WTDRDQBEARUVNC-LURJTMIESA-N", "ondansetron": "FELGMEQIXOGIFQ-UHFFFAOYSA-N",
  "metoclopramide": "TTWJBBZEZQICBI-UHFFFAOYSA-N", "loperamide": "RDOIQAHITMMDAJ-UHFFFAOYSA-N",
  "tamoxifen": "NKANXQFJJICGDU-QPLCGJKRSA-N", "imatinib": "KTUFNOKKBVMGRW-UHFFFAOYSA-N",
  "methotrexate": "FBOZXECLQNJBKD-ZDUSSCGKSA-N", "fluorouracil": "GHASVSINZRGABV-UHFFFAOYSA-N",
  "cyclophosphamide": "CMSMOCZEIVJLDB-UHFFFAOYSA-N", "allopurinol": "OFCNXPDARWKPPY-UHFFFAOYSA-N",
  "colchicine": "IAKHMKGGTNLKSZ-INIZCTEOSA-N", "chloroquine": "WHTVZRBIWZFKQO-UHFFFAOYSA-N",
  "hydroxychloroquine": "XXSMGPRMXLTPCZ-UHFFFAOYSA-N", "quinine": "LOUPRKONTZGTKE-WZBLMQSHSA-N",
  "thalidomide": "UEJJHQNACJXSKW-UHFFFAOYSA-N", "ketamine": "YQEZLKZALYSWHR-UHFFFAOYSA-N",
  "propofol": "OLBCVFGFOZPWHH-UHFFFAOYSA-N", "adrenaline": "UCTWMZQNUQWSLP-VIFPVBQESA-N",
  "dopamine": "VYFYYTLLBUKUHU-UHFFFAOYSA-N", "serotonin": "QZAYGJVTTNCVMB-UHFFFAOYSA-N",
  "melatonin": "DRLFMBDRBRZALE-UHFFFAOYSA-N", "amphetamine": "KWTSXDURSIMDCE-UHFFFAOYSA-N",
  "menthol": "NOOLISFMXDJSKH-UHFFFAOYSA-N", "vanillin": "MWOOGOJBHIARFG-UHFFFAOYSA-N",
  "camphor": "DSSYKIVIOFKYAU-UHFFFAOYSA-N", "cholesterol": "HVYWMOMLDIMFJA-DPAQBDIFSA-N",
  "ascorbic acid": "CIWBSHSKHKDKBQ-JLAZNSOCSA-N", "THF": "WYURNTSHIVDZCO-UHFFFAOYSA-N",
  "DCM": "YMWUJEATGCHHMB-UHFFFAOYSA-N", "DMF": "ZMXDDKWLCZADIW-UHFFFAOYSA-N", "DMSO": "IAZDPXIOMUYVGZ-UHFFFAOYSA-N",
  "acetone": "CSCPPACGZOOCGX-UHFFFAOYSA-N", "pyridine": "JUJWROOIHBZHMG-UHFFFAOYSA-N",
  "triethylamine": "ZMANZCXQSJIPKH-UHFFFAOYSA-N", "DIPEA": "JGFZNNIVVJXRND-UHFFFAOYSA-N",
  "DMAP": "VHYFNPMBLIVWCW-UHFFFAOYSA-N", "DBU": "GQHTUMJGOHRCHB-UHFFFAOYSA-N", "TFA": "DTQVDTLACAAQTR-UHFFFAOYSA-N",
  "mCPBA": "NHQDETIJWKXCTC-UHFFFAOYSA-N", "NBS": "PCLIMKBDDGJMGD-UHFFFAOYSA-N", "Boc2O": "DYHSDKLCOJIUFX-UHFFFAOYSA-N",
  "TsCl": "YYROPELSRYBVMQ-UHFFFAOYSA-N", "SOCl2": "FYSNRJHAOHDILO-UHFFFAOYSA-N",
  "oxalyl chloride": "CTSLXHKWHWQRSH-UHFFFAOYSA-N", "POCl3": "XHXFXVLFKHQFAL-UHFFFAOYSA-N",
  "K2CO3": "BWHMMNNQKKPAPP-UHFFFAOYSA-L", "NaHCO3": "UIIMBOGNXHQVGW-UHFFFAOYSA-M",
  "Cs2CO3": "FJDQFPXHSGXQBY-UHFFFAOYSA-L", "NaH": "BZKBCQXYZZXSCO-UHFFFAOYSA-N", "NaOH": "HEMHJVSKTPXQMS-UHFFFAOYSA-M",
  "LiAlH4": "OCZDCIYGECBNKL-UHFFFAOYSA-N", "NaBH4": "YOQDYZUWIQVZSF-UHFFFAOYSA-N",
  "DIBAL-H": "AZWXAPCAJCYGIA-UHFFFAOYSA-N", "n-BuLi": "MZRVEZGGRBJDDB-UHFFFAOYSA-N",
  "LDA": "ZCSHNCUQKCANBX-UHFFFAOYSA-N", "Pd(PPh3)4": "NFHFRUOZVGFOOS-UHFFFAOYSA-N",
  "Pd(OAc)2": "YJVFFLUZDVXJQI-UHFFFAOYSA-L", "Pd2(dba)3": "CYPYTURSJDMMMP-WVCUSYJESA-N",
  "HATU": "FKBFHOSFPRWJNV-UHFFFAOYSA-N", "EDC": "LMDZBCPBFSXMTL-UHFFFAOYSA-N", "DCC": "QOSSAOTZNIDXMA-UHFFFAOYSA-N",
  "HOBt": "ASOKPJOREAFHNY-UHFFFAOYSA-N", "TBAF": "FPGGTKZVZWFYPV-UHFFFAOYSA-M", "TBSCl": "BCNZYOJHNLTNEZ-UHFFFAOYSA-N",
  "PCC": "LEHBURLTIWGHEM-UHFFFAOYSA-N", "Dess-Martin periodinane": "NKLCNNUWBJBICK-UHFFFAOYSA-N",
  "Grubbs catalyst": "PNPBGYBHLCEVMK-UHFFFAOYSA-L", "Wilkinson's catalyst": "IXAYKDDZKIZSPV-UHFFFAOYSA-M",
  "Et3N·HCl": "ILWRPSCZWQJDMK-UHFFFAOYSA-N", "TEMPO": "QYTDEUPAUMOIOP-UHFFFAOYSA-N",
  "NaN3": "PXIPVTKHYLBLMZ-UHFFFAOYSA-N", "KMnO4": "VZJVWSHVAAUDKD-UHFFFAOYSA-N",
};
let right = 0;
const wrong: string[] = [];
const t0 = performance.now();
for (const [name, want] of Object.entries(WANT)) {
  const smiles = nameToSmiles(name), got = smiles && keyOf(smiles);
  if (got === want) right++;
  else wrong.push(`${name}: ${got ?? "no structure"}`);
}
const ms = (performance.now() - t0) / Object.keys(WANT).length;
if (wrong.length) console.log(`wrong: ${wrong.join("; ")}`);
console.log(`names.check: ${right}/${Object.keys(WANT).length} common names give the right structure (${ms.toFixed(1)} ms each with layout); ${entries.length} table entries read`);
assert.equal(Object.keys(WANT).length, 200);
assert.equal(wrong.length, 0);
