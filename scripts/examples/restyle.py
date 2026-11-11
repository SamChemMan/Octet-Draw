# Applies a journal's style to every figure in a folder: each drawing gets the journal's preset and its column's page,
# as set_brief gives them, and is saved in OUT. A figure that does not fit the page is named with what is off it.
# Run: python3 restyle.py JOURNAL COLUMNS FOLDER OUT   (for example: python3 restyle.py Angewandte 1 figures restyled)
import json, os, sys
from octet import Octet

journal, columns, folder, out = sys.argv[1:5]
o = Octet()
os.makedirs(out, exist_ok=True)
for name in sorted(f for f in os.listdir(folder) if f.lower().endswith((".cdxml", ".cdx", ".oct"))):
    o.open(os.path.join(folder, name))
    o.call("set_brief", {"destination": {"kind": "paper", "journal": journal, "columns": int(columns)}})
    read = o.call("read")
    o.save(os.path.join(out, name))
    check = "" if read["check"] == "clean" else f", check {json.dumps(read['check'], separators=(',', ':'))}"
    print(f"{name}: {read['style']}{check}")
o.close()
