package octet;
import org.teavm.jso.JSExport;
import uk.ac.cam.ch.wwmm.opsin.NameToStructure;
public class OpsinJs {
  private static NameToStructure n2s;
  @JSExport
  public static void init() { if (n2s == null) n2s = NameToStructure.getInstance(); }
  @JSExport
  public static String parseToSmiles(String name) { init(); return n2s.parseToSmiles(name); }
  public static void main(String[] args) {}
}
