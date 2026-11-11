# Renumbers the compounds across the schemes of a review in the order they first come: scheme by scheme, row by row
# from the top, left to right. A compound drawn again gets its first number. Each drawing is saved in OUT.
# Run: python3 renumber.py OUT scheme1.cdxml scheme2.oct ...
import os, sys
from octet import Octet

out, files, o, numbers = sys.argv[1], sys.argv[2:], Octet(), {}
os.makedirs(out, exist_ok=True)

# Rows from the top (a structure whose middle is above the bottom of the row's highest one is in that row), each left
# to right. A box is [left, bottom, right, top].
def in_order(structures):
    rows = []
    for s in sorted(structures, key=lambda s: -s["box"][3]):
        if rows and (s["box"][1] + s["box"][3]) / 2 > rows[-1][0]["box"][1]: rows[-1].append(s)
        else: rows.append([s])
    return [s for row in rows for s in sorted(row, key=lambda s: s["box"][0])]

for file in files:
    o.open(file)
    numbered = in_order([s for s in o.call("read", {"detail": "full"})["structures"] if s.get("number")])
    operations = []
    for s in numbered:
        key = s.get("inchiKey") or s.get("smiles") or f"{file} {s['id']}"
        numbers.setdefault(key, str(len(numbers) + 1))
        operations.append({"op": "number", "structure": s["id"], "number": numbers[key]})
    if operations: o.call("change", {"operations": operations})
    o.save(os.path.join(out, os.path.basename(file)))
    renumbered = ", ".join(f"{s['number']} is {op['number']}" for s, op in zip(numbered, operations))
    print(f"{os.path.basename(file)}: {renumbered}")
o.close()
