import json, sys, glob, os, datetime
# usage: aicost.py <workflow transcript dir> : per agent, what the AI spent (turns, output tokens, seconds)
D = sys.argv[1]
labels = {}
for line in open(D + "/journal.jsonl"):
    try: e = json.loads(line)
    except Exception: continue
    if e.get("type") == "started": labels[e["agentId"]] = e["label"]
rows = []
for f in glob.glob(D + "/agent-*.jsonl"):
    aid = os.path.basename(f)[6:-6]
    turns = out = calls = 0; first = last = None; think = 0
    for line in open(f):
        try: e = json.loads(line)
        except Exception: continue
        t = e.get("timestamp")
        if t: first = first or t; last = t
        m = e.get("message") or {}
        if m.get("role") != "assistant": continue
        u = m.get("usage") or {}
        out += u.get("output_tokens", 0)
        c = m.get("content") or []
        tu = [x for x in c if isinstance(x, dict) and x.get("type") == "tool_use"]
        if tu: turns += 1
        calls += sum(1 for x in tu if "run.mjs call" in json.dumps(x.get("input", {})))
    sec = (datetime.datetime.fromisoformat(last.replace("Z", "+00:00")) - datetime.datetime.fromisoformat(first.replace("Z", "+00:00"))).total_seconds() if first and last else 0
    rows.append((labels.get(aid, aid).replace("eval:", ""), turns, calls, out, round(sec)))
rows.sort()
print("| Job | Model turns | Octet calls | Output tokens | Seconds |"); print("|---|---|---|---|---|")
for r in rows: print("| " + " | ".join(str(x) for x in r) + " |")
tot = [sum(r[i] for r in rows) for i in (1, 2, 3, 4)]
print(f"| TOTAL ({len(rows)}) | {tot[0]} | {tot[1]} | {tot[2]} | {tot[3]} |")
med = sorted(r[4] for r in rows)[len(rows) // 2]; print("median seconds a job:", med, "| median output tokens:", sorted(r[3] for r in rows)[len(rows) // 2])
