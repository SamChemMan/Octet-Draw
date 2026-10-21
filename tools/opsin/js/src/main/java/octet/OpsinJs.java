package octet;
import org.teavm.jso.JSExport;
import uk.ac.cam.ch.wwmm.opsin.NameToStructure;
import uk.ac.cam.ch.wwmm.opsin.OctetAtoms;
public class OpsinJs {
  private static NameToStructure n2s;
  @JSExport
  public static void init() { if (n2s == null) n2s = NameToStructure.getInstance(); }
  @JSExport
  public static String parseToSmiles(String name) { init(); return n2s.parseToSmiles(name); }
  // The structure with each atom's locants (OctetAtoms), for the donor atoms cited in names of coordination compounds.
  @JSExport
  public static String parseToAtoms(String name) { init(); return OctetAtoms.parse(n2s, name); }
  public static void main(String[] args) {}
}
