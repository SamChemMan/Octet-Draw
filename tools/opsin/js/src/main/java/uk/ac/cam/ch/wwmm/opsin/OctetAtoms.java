package uk.ac.cam.ch.wwmm.opsin;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Octet: a name's structure as OPSIN builds it, with each atom's locants, as JSON. Octet uses the locants to find the
// donor atoms it cites in names of coordination compounds (kappa terms). Hydrogen atoms are listed like any other.
// {"atoms":[["C",0,0,"1"],...],"bonds":[[0,1,2],...]}: element, charge, mass number (0 when not given) and the
// locants joined by spaces; each bond by its atoms' indexes and its order.
public class OctetAtoms {
  public static String parse(NameToStructure n2s, String name) {
    OpsinResult result = n2s.parseChemicalName(name);
    if (result.getStatus() == OpsinResult.OPSIN_RESULT_STATUS.FAILURE) return null;
    Fragment frag = result.getStructure();
    List<Atom> atoms = frag.getAtomList();
    Map<Atom, Integer> index = new HashMap<>();
    StringBuilder out = new StringBuilder("{\"atoms\":[");
    for (int k = 0; k < atoms.size(); k++) {
      Atom a = atoms.get(k);
      index.put(a, k);
      if (k > 0) out.append(',');
      Integer isotope = a.getIsotope();
      String locants = String.join(" ", a.getLocants()).replace("\\", "").replace("\"", "");
      out.append("[\"").append(a.getElement().toString()).append("\",").append(a.getCharge()).append(',')
        .append(isotope == null ? 0 : isotope).append(",\"").append(locants).append("\"]");
    }
    out.append("],\"bonds\":[");
    boolean first = true;
    for (Bond b : frag.getBondSet()) {
      if (!first) out.append(',');
      first = false;
      out.append('[').append(index.get(b.getFromAtom())).append(',').append(index.get(b.getToAtom())).append(',').append(b.getOrder()).append(']');
    }
    return out.append("]}").toString();
  }
}
