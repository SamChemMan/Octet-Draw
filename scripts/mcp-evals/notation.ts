// The line notation's model test (src/notation.ts, NOTATION): does a fresh small model, given only the notation's
// description and a job in words, write lines Octet draws right at the first try? Twelve jobs of different kinds.
//   node scripts/mcp-evals/notation.ts prompts               each job's prompt, one JSON line a job (for an agent)
//   node scripts/mcp-evals/notation.ts ask [model]           asks claude -p (haiku by default), once a job, then checks
//   node scripts/mcp-evals/notation.ts check answers.json    checks answers written elsewhere: { id: lines }
// A check reads the lines (fromLines), draws them with no window (scripts/headless) and compares each compound number's
// InChIKey, the arrows' kinds and the words each job names. It prints a table and what each model wrote.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// As run.ts: Indigo's wasm as first compiled, so the process ends when the work does.
if (!process.execArgv.includes("--liftoff-only")) process.exit(spawnSync(process.execPath, ["--liftoff-only", ...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit" }).status ?? 1);

const { load, drawing } = await import("../headless/host.ts");
const { NOTATION, callOf, fromLines } = await import("../../src/notation.ts");
type Want = { smiles: Record<string, string>; arrows?: string[]; words?: string[]; cycle?: true };
const JOBS: { id: string; job: string; want: Want }[] = [
  { id: "fischer", job: "Draw the Fischer esterification: benzoic acid and methanol give methyl benzoate (number it 1) with sulfuric acid at reflux for 6 h, 88% yield.", want: { smiles: { 1: "COC(=O)c1ccccc1" }, arrows: ["reaction"], words: ["H2SO4", "88%"] } },
  { id: "suzuki-amounts", job: "Draw a Suzuki coupling: 4-bromoanisole and phenylboronic acid (1.2 equiv) give 4-methoxybiphenyl (2) with Pd(PPh3)4 (3 mol%) and K2CO3 (2 equiv) in toluene/water at 90 °C for 12 h, 85% yield.", want: { smiles: { 2: "COc1ccc(cc1)-c1ccccc1" }, arrows: ["reaction"], words: ["Pd(PPh3)4", "K2CO3", "85%"] } },
  { id: "swern", job: "Draw a Swern oxidation of 1-octanol to octanal (3): oxalyl chloride and DMSO in CH2Cl2 at −78 °C, then triethylamine; 92% yield.", want: { smiles: { 3: "CCCCCCCC=O" }, arrows: ["reaction"], words: ["then", "92%"] } },
  { id: "three-steps", job: "Draw one scheme: cyclohexanone is reduced with NaBH4 in methanol at 0 °C to cyclohexanol (1, 95%), which with TsCl and pyridine gives cyclohexyl tosylate (2, 80%), which with sodium azide in DMF at 80 °C gives azidocyclohexane (3, 75%).", want: { smiles: { 1: "OC1CCCCC1", 2: "Cc1ccc(cc1)S(=O)(=O)OC1CCCCC1", 3: "[N-]=[N+]=NC1CCCCC1" }, arrows: ["reaction", "reaction", "reaction"], words: ["NaBH4", "95%", "75%"] } },
  { id: "grignard-steps", job: "Draw the addition of methylmagnesium bromide to benzaldehyde giving 1-phenylethanol (4), as two numbered operations over one arrow: 1. MeMgBr, THF, 0 °C; 2. aqueous NH4Cl. Overall yield 90%.", want: { smiles: { 4: "CC(O)c1ccccc1" }, arrows: ["reaction"], words: ["MeMgBr", "NH4Cl", "90%"] } },
  { id: "tbs-change", job: "Draw ethyl (S)-lactate (1), then its TBS ether (2), made with TBSCl and imidazole in DMF, 95% yield. Write compound 2 as a change to compound 1, not as a new SMILES.", want: { smiles: { 1: "CCOC(=O)[C@H](C)O", 2: "CCOC(=O)[C@H](C)O[Si](C)(C)C(C)(C)C" }, arrows: ["reaction"], words: ["TBSCl", "95%"] } },
  { id: "tautomer", job: "Draw the keto–enol tautomerism of acetone (1) and prop-1-en-2-ol (2) as an equilibrium.", want: { smiles: { 1: "CC(C)=O", 2: "CC(O)=C" }, arrows: ["equilibrium"] } },
  { id: "retro", job: "Draw one retrosynthetic step: ibuprofen (1) disconnects to 1-(4-isobutylphenyl)ethanol (2).", want: { smiles: { 1: "CC(C)Cc1ccc(cc1)C(C)C(O)=O", 2: "CC(C)Cc1ccc(cc1)C(C)O" }, arrows: ["retro"] } },
  { id: "cycle", job: "Draw the catalytic cycle of a Suzuki coupling with three intermediates, with L, Ar and Ar' as labels: Pd(0)L2 (A); the oxidative addition complex L2Pd(Ar)Br (B); and L2Pd(Ar)Ar' (C). ArBr goes in at oxidative addition (OA); Ar'B(OH)2 goes in and B(OH)2Br comes out at transmetallation (TM); Ar–Ar' comes out at reductive elimination (RE), which gives back A. Put L = PPh3 in the middle.", want: { smiles: {}, cycle: true, words: ["OA", "TM", "RE", "ArBr", "PPh3"] } },
  { id: "scope", job: "Draw a substrate scope of 4-substituted acetophenones as one core with a group R at the 4-position: R = OMe (3a, 91%), F (3b, 85%), CF3 (3c, 70%), Me (3d, 88%). Put each yield under its number.", want: { smiles: { "3a": "COc1ccc(cc1)C(C)=O", "3b": "CC(=O)c1ccc(F)cc1", "3c": "CC(=O)c1ccc(cc1)C(F)(F)F", "3d": "Cc1ccc(cc1)C(C)=O" }, words: ["91%", "88%"] } },
  { id: "figure", job: "Draw a figure titled Organocatalysts with L-proline (1) and (2S,5S)-5-benzyl-2-tert-butyl-3-methylimidazolidin-4-one (2) side by side in one row.", want: { smiles: { 1: "OC(=O)[C@@H]1CCCN1", 2: "CN1[C@@H](C(C)(C)C)N[C@@H](Cc2ccccc2)C1=O" }, words: ["Organocatalysts"] } },
  { id: "two-schemes", job: "Draw two schemes, each with its title. Scheme 1: toluene is oxidised with KMnO4 in water at reflux to benzoic acid (1), 70%. Scheme 2: benzoic acid (1) with SOCl2 gives benzoyl chloride (2), 95%.", want: { smiles: { 1: "OC(=O)c1ccccc1", 2: "ClC(=O)c1ccccc1" }, arrows: ["reaction", "reaction"], words: ["Scheme", "KMnO4", "SOCl2"] } },
];
const prompt = (job: string) => `You tell a chemical drawing app what to draw by writing lines in this notation:\n\n${NOTATION}\n\nWrite only the lines for this job, with no other text.\n\nJob: ${job}`;

async function check(answers: Record<string, string>) {
  const { handle } = await import("../../src/mcp.ts");
  const { parseStructure, toInchiKey } = await import("../../src/chem.ts");
  await load();
  let right = 0;
  console.log("| Job | Right | Why not |\n|---|---|---|");
  for (const { id, want } of JOBS) {
    // A model's answer, without the code fence it may put round it.
    const text = (answers[id] ?? "").replace(/^```\w*\n?|\n?```$/g, "").trim(), r = fromLines({ lines: text }), wrong: string[] = [];
    if (typeof r === "string") wrong.push(`read: ${r}`);
    else {
      const d = drawing("paper"), call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", { client: "Notation test" })).result;
      const done = await call(...callOf(r));
      if (done.isError) wrong.push(`drawn: ${done.content[0].text}`);
      else {
        const full = (await call("read", { detail: "full" })).structuredContent, m = d.host.doc();
        for (const [n, s] of Object.entries(want.smiles)) if (!full.structures.some((x: { number?: string; inchiKey: string }) => x.number === n && x.inchiKey === toInchiKey(parseStructure(s)))) wrong.push(`compound ${n}`);
        const kinds = full.reactions.flatMap((x: { steps: { arrow: string }[] }) => x.steps.map((s) => m.arrows!.find((a) => `a${a.id}` === s.arrow)!.kind));
        if (want.arrows && kinds.join() !== want.arrows.join()) wrong.push(`arrows ${kinds.join(", ")}`);
        if (want.cycle && !m.cycles?.length) wrong.push("no cycle");
        const shown = (m.captions ?? []).map((c) => c.text).join(" ");
        for (const w of want.words ?? []) if (!shown.includes(w)) wrong.push(`no ${w}`);
      }
    }
    if (!wrong.length) right++;
    console.log(`| ${id} | ${wrong.length ? "no" : "yes"} | ${wrong.join("; ").replace(/\|/g, "/").slice(0, 200)} |`);
  }
  console.log(`\n${right} of ${JOBS.length} right at the first try.\n`);
  for (const { id } of JOBS) console.log(`${id}:\n${answers[id] ?? "(no answer)"}\n`);
}

const [mode, arg] = process.argv.slice(2);
if (mode === "prompts") for (const { id, job } of JOBS) console.log(JSON.stringify({ id, prompt: prompt(job) }));
else if (mode === "check") await check(JSON.parse(readFileSync(arg, "utf8")));
else if (mode === "ask") {
  // Each job in a fresh session with no tools, from a folder with no project files.
  const answers: Record<string, string> = {}, dir = new URL("./out/", import.meta.url);
  for (const { id, job } of JOBS) {
    const r = spawnSync("claude", ["-p", "--model", arg ?? "haiku", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--system-prompt", "Answer with only what is asked.", prompt(job)], { encoding: "utf8", cwd: "/" });
    answers[id] = r.stdout.trim();
    if (r.status) console.error(`${id}: ${r.stderr.trim()}`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(`notation-${Date.now()}.json`, dir), JSON.stringify(answers, null, 1));
  await check(answers);
} else console.log("node scripts/mcp-evals/notation.ts prompts | ask [model] | check answers.json");
