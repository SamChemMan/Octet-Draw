# One drawing a row of a table: a CSV with the columns number, name and smiles, and a first row of headings. Each row
# is drawn with its number under it and its name under that, and saved in OUT as NUMBER.svg (or the format given:
# oct, cdxml, pdf, png and the rest). Undo takes each row away once it is saved, so Octet keeps one drawing open.
# A row Octet cannot draw is named with the reason, and the exit code is 1.
# Run: python3 table.py compounds.csv OUT [svg]
import csv, os, sys
from octet import Octet

table, out, format = sys.argv[1], sys.argv[2], (sys.argv[3:] or ["svg"])[0]
o, failed = Octet(), 0
os.makedirs(out, exist_ok=True)
with open(table, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        try:
            o.call("draw", {"structures": [{"text": row["smiles"], "number": row["number"], "caption": row["name"]}]})
            o.save(os.path.join(out, f"{row['number']}.{format}"), format)
            o.call("advanced", {"tool": "run_command", "args": {"command": "undo"}})
            print(f"{row['number']}.{format}: {row['name']}")
        except RuntimeError as e:
            print(f"{row['number']}: {e}")
            failed += 1
o.close()
sys.exit(1 if failed else 0)
