package dk.brics.automaton;

import java.io.*;
import java.util.*;
import java.util.zip.*;

/** Build-time only (runs on the JDK): turns OPSIN's resources into one pack file.
 *  .aut files (Java serialisation) are re-encoded in a compact format that needs no ObjectInputStream.
 *  Usage: PackBuilder opsin-core.jar out.bin [overrides-dir] [noaut]. A file in overrides-dir at a resource's path
 *  (uk/ac/cam/ch/wwmm/opsin/resources/arylGroups.xml) replaces that resource: Octet's changes to OPSIN's data. */
public class PackBuilder {
  static final String ROOT = "uk/ac/cam/ch/wwmm/opsin/resources/";

  public static void main(String[] args) throws Exception {
    File jar = new File(args[0]);
    File out = new File(args[1]);
    boolean includeAutomata = true;
    File overrides = null;
    for (int i = 2; i < args.length; i++) {
      if (args[i].equals("noaut")) includeAutomata = false;
      else overrides = new File(args[i]);
    }
    int n = 0, replaced = 0;
    try (ZipFile z = new ZipFile(jar);
         DataOutputStream o = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(out)))) {
      for (Enumeration<? extends ZipEntry> e = z.entries(); e.hasMoreElements();) {
        ZipEntry ze = e.nextElement();
        String name = ze.getName();
        if (ze.isDirectory() || !name.startsWith(ROOT)) continue;
        if (name.endsWith(".dtd")) continue;
        byte[] data;
        File override = overrides == null ? null : new File(overrides, name);
        if (override != null && override.isFile()) {
          data = java.nio.file.Files.readAllBytes(override.toPath());
          replaced++;
        } else {
          try (InputStream in = z.getInputStream(ze)) { data = in.readAllBytes(); }
        }
        if (name.endsWith(".aut")) {
          if (!includeAutomata) continue;
          RunAutomaton ra = RunAutomaton.load(new ByteArrayInputStream(data));
          data = encode(ra);
        }
        o.writeUTF(name);
        o.writeInt(data.length);
        o.write(data);
        n++;
      }
      o.writeUTF("");
    }
    System.err.println("entries: " + n + ", replaced by Octet's: " + replaced);
  }

  static byte[] encode(RunAutomaton ra) throws IOException {
    ByteArrayOutputStream bos = new ByteArrayOutputStream();
    DataOutputStream d = new DataOutputStream(bos);
    d.writeInt(ra.size);
    d.writeInt(ra.initial);
    d.writeInt(ra.points.length);
    d.writeBoolean(ra.classmap != null);
    for (boolean b : ra.accept) d.writeBoolean(b);
    for (char c : ra.points) d.writeChar(c);
    for (int t : ra.transitions) writeVarint(d, t + 1);
    d.flush();
    return bos.toByteArray();
  }

  static void writeVarint(DataOutputStream d, int v) throws IOException {
    while ((v & ~0x7F) != 0) { d.writeByte((v & 0x7F) | 0x80); v >>>= 7; }
    d.writeByte(v);
  }
}
