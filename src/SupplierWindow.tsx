// The Suppliers window (Find suppliers, issue 114): the suppliers PubChem lists for the selected structures (or the
// drawing's), in a window in the middle of Octet's. While PubChem answers, Octet's mark draws itself, as it does while
// an AI app draws (McpMagic). Then a search field over the list: each supplier with its monogram (PubChem has no
// logos), its name, its catalogue numbers for the compound and how many products PubChem lists, and a star that keeps
// it as a favourite (favourites go first, for every compound). A supplier opens its product page in the browser. With
// several structures, a list at the top picks the structure. Open in PubChem opens the compound's vendor section.
import { useState, type CSSProperties } from "react";
import { ArrowSquareOut, Star } from "@phosphor-icons/react";
import { Dialog } from "./Dialog";
import { MarkParts } from "./McpMagic";
import { Select } from "./Select";
import { monogram, shownSuppliers, supplierKey, type Found } from "./suppliers";

export type SupplierTarget = { label: string; found: Found };

type Props = {
  targets: SupplierTarget[]; at: number; onAt: (k: number) => void;
  favourites: string[]; onStar: (name: string, on: boolean) => void;
  onOpen: (url: string) => void; onVendors: (cid: number) => void; onClose: () => void;
};

export function SuppliersWindow({ targets, at, onAt, favourites, onStar, onOpen, onVendors, onClose }: Props) {
  const [search, setSearch] = useState(""), [turn, setTurn] = useState(0);
  const found = targets[at]?.found, list = found && found !== "busy" ? found.suppliers : [];
  const shown = shownSuppliers(list, favourites, search), fav = new Set(favourites);
  const cid = found && found !== "busy" ? found.cid : undefined;
  // Return in the search field opens the first supplier it shows; elsewhere it presses Open in PubChem.
  const action = () => {
    if (document.activeElement?.classList.contains("list-find")) { if (shown[0]) onOpen(shown[0].url); }
    else if (cid) onVendors(cid);
    else onClose();
  };
  return (
    <Dialog title="Suppliers" plain wide action={cid ? "Open in PubChem" : undefined} cancel="Close" onAction={action} onClose={onClose}>
      <div className="suppliers">
        <div className="suppliers-head">
          <h2>Suppliers</h2>
          {targets.length > 1 && <Select label="Structure" value={String(at)} options={targets.map((t, k): [string, string] => [String(k), t.label])} onChange={(v) => { onAt(Number(v)); setSearch(""); }} />}
        </div>
        {found === "busy" || found === undefined ? (
          <div className="suppliers-wait" role="status">
            <div className="suppliers-mark" aria-hidden>
              <div className="suppliers-scale">
                <div key={turn} className="mcp-mol" onAnimationIteration={() => setTurn(turn + 1)}><MarkParts /></div>
              </div>
            </div>
            <span>Searching PubChem</span>
          </div>
        ) : !list.length ? (
          <p className="suppliers-none">{found === null ? "PubChem has no record of this structure." : "PubChem lists no suppliers for this structure."}</p>
        ) : (
          <>
            <input className="list-find" type="search" placeholder="Find a supplier" aria-label="Find a supplier" value={search} onChange={(e) => setSearch(e.target.value)} data-first />
            <ul className="suppliers-list" aria-label={`${list.length} suppliers`}>
              {shown.map((s, k) => {
                const on = fav.has(supplierKey(s.name));
                return (
                  <li key={s.name} className="supplier" style={{ "--i": Math.min(k, 12) } as CSSProperties}>
                    <button className="supplier-open" onClick={() => onOpen(s.url)} data-tip="Open in the browser">
                      <span className="supplier-mono" aria-hidden>{monogram(s.name)}</span>
                      <span className="supplier-text">
                        <span className="supplier-name">{s.name}</span>
                        {(s.codes.length > 0 || s.products > 1) && <span className="supplier-more">{[s.codes.join(", "), s.products > 1 ? `${s.products} products` : ""].filter(Boolean).join(" · ")}</span>}
                      </span>
                      <ArrowSquareOut size={14} className="supplier-out" aria-hidden />
                    </button>
                    <button className={on ? "supplier-star on" : "supplier-star"} aria-pressed={on} aria-label={`Favourite ${s.name}`} data-tip={on ? "Remove from favourites" : "Add to favourites"} onClick={() => onStar(s.name, !on)}>
                      <Star size={16} weight={on ? "fill" : "regular"} />
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="suppliers-none">No supplier matches.</li>}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}
