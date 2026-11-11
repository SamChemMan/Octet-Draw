# Checks every structure in a manuscript's drawings: Octet's warnings (valence, stereo, a number on two structures)
# and its layout check (overlaps, off the page), one line each, then the count. The exit code is 1 when there is one.
# Run: python3 check.py scheme1.cdxml figure2.oct ...
import os, sys
from octet import Octet

o, found = Octet(), 0
for file in sys.argv[1:]:
    try: o.open(file)
    except RuntimeError as e:
        print(f"{os.path.basename(file)}: {e}")
        found += 1
        continue
    warnings = o.call("read", {"detail": "full"})["warnings"]
    print(f"{os.path.basename(file)}: " + (f"{len(warnings)} to look at" if warnings else "clean"))
    for w in warnings:
        print(f"  {w.get('atom') or w.get('structure') or ' and '.join(w.get('ids', []))} {w['message']}")
    found += len(warnings)
print(f"{found} to look at.")
o.close()
sys.exit(1 if found else 0)
