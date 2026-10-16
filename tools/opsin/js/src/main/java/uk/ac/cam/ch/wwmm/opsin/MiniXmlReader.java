package uk.ac.cam.ch.wwmm.opsin;

import java.util.ArrayList;
import java.util.List;

import javax.xml.namespace.NamespaceContext;
import javax.xml.namespace.QName;
import javax.xml.stream.Location;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

/**
 * Octet: a small non-validating XML pull parser covering what OPSIN's own
 * resource files use (elements, attributes, text, comments, PIs, DOCTYPE skipped,
 * predefined and numeric entities). Replaces Woodstox to keep the output small.
 */
final class MiniXmlReader implements XMLStreamReader {
	private final String s;
	private int pos;
	private int event = START_DOCUMENT;
	private String name;
	private final List<String> attrNames = new ArrayList<>();
	private final List<String> attrValues = new ArrayList<>();
	private String text;
	private boolean pendingEnd;

	MiniXmlReader(String xml) {
		this.s = xml;
	}

	public int next() throws XMLStreamException {
		if (event == END_DOCUMENT) throw new XMLStreamException("No more events");
		if (pendingEnd) {
			pendingEnd = false;
			return event = END_ELEMENT;
		}
		attrNames.clear();
		attrValues.clear();
		text = null;
		int n = s.length();
		if (pos >= n) return event = END_DOCUMENT;
		if (s.charAt(pos) != '<') {
			int end = s.indexOf('<', pos);
			if (end < 0) end = n;
			text = decode(s.substring(pos, end), false);
			pos = end;
			return event = CHARACTERS;
		}
		if (s.startsWith("<!--", pos)) {
			int end = find("-->", pos + 4);
			text = s.substring(pos + 4, end);
			pos = end + 3;
			return event = COMMENT;
		}
		if (s.startsWith("<?", pos)) {
			int end = find("?>", pos + 2);
			text = s.substring(pos + 2, end);
			pos = end + 2;
			return event = PROCESSING_INSTRUCTION;
		}
		if (s.startsWith("<![CDATA[", pos)) {
			int end = find("]]>", pos + 9);
			text = s.substring(pos + 9, end);
			pos = end + 3;
			return event = CDATA;
		}
		if (s.startsWith("<!", pos)) {
			int depth = 0;
			int i = pos;
			for (; i < n; i++) {
				char c = s.charAt(i);
				if (c == '[') depth++;
				else if (c == ']') depth--;
				else if (c == '>' && depth == 0) break;
			}
			text = s.substring(pos, i);
			pos = i + 1;
			return event = DTD;
		}
		if (s.startsWith("</", pos)) {
			int end = find(">", pos + 2);
			name = local(s.substring(pos + 2, end).trim());
			pos = end + 1;
			return event = END_ELEMENT;
		}
		int i = pos + 1;
		int start = i;
		while (i < n && !isSpace(s.charAt(i)) && s.charAt(i) != '>' && s.charAt(i) != '/') i++;
		name = local(s.substring(start, i));
		for (;;) {
			while (i < n && isSpace(s.charAt(i))) i++;
			if (i >= n) throw new XMLStreamException("Unexpected end of document");
			char c = s.charAt(i);
			if (c == '>') { i++; break; }
			if (c == '/') {
				if (i + 1 >= n || s.charAt(i + 1) != '>') throw new XMLStreamException("Bad tag at " + i);
				i += 2;
				pendingEnd = true;
				break;
			}
			int a = i;
			while (i < n && s.charAt(i) != '=' && !isSpace(s.charAt(i))) i++;
			String an = s.substring(a, i);
			while (i < n && isSpace(s.charAt(i))) i++;
			if (i >= n || s.charAt(i) != '=') throw new XMLStreamException("Expected = at " + i);
			i++;
			while (i < n && isSpace(s.charAt(i))) i++;
			char q = s.charAt(i);
			if (q != '"' && q != '\'') throw new XMLStreamException("Expected quote at " + i);
			int ve = s.indexOf(q, i + 1);
			if (ve < 0) throw new XMLStreamException("Unterminated attribute");
			attrNames.add(local(an));
			attrValues.add(decode(s.substring(i + 1, ve), true));
			i = ve + 1;
		}
		pos = i;
		return event = START_ELEMENT;
	}

	private int find(String what, int from) throws XMLStreamException {
		int i = s.indexOf(what, from);
		if (i < 0) throw new XMLStreamException("Missing " + what);
		return i;
	}

	private static boolean isSpace(char c) {
		return c == ' ' || c == '\t' || c == '\n' || c == '\r';
	}

	private static String local(String qname) {
		int c = qname.indexOf(':');
		return c < 0 ? qname : qname.substring(c + 1);
	}

	private static String decode(String raw, boolean attribute) throws XMLStreamException {
		if (raw.indexOf('&') < 0 && raw.indexOf('\r') < 0 && !(attribute && (raw.indexOf('\n') >= 0 || raw.indexOf('\t') >= 0))) {
			return raw;
		}
		StringBuilder b = new StringBuilder(raw.length());
		int n = raw.length();
		for (int i = 0; i < n; i++) {
			char c = raw.charAt(i);
			if (c == '&') {
				int semi = raw.indexOf(';', i);
				if (semi < 0) throw new XMLStreamException("Bad entity");
				String e = raw.substring(i + 1, semi);
				switch (e) {
					case "lt": b.append('<'); break;
					case "gt": b.append('>'); break;
					case "amp": b.append('&'); break;
					case "quot": b.append('"'); break;
					case "apos": b.append('\''); break;
					default:
						if (e.startsWith("#x")) b.appendCodePoint(Integer.parseInt(e.substring(2), 16));
						else if (e.startsWith("#")) b.appendCodePoint(Integer.parseInt(e.substring(1)));
						else throw new XMLStreamException("Unknown entity &" + e + ";");
				}
				i = semi;
			} else if (c == '\r') {
				if (i + 1 < n && raw.charAt(i + 1) == '\n') i++;
				b.append(attribute ? ' ' : '\n');
			} else if (attribute && (c == '\n' || c == '\t')) {
				b.append(' ');
			} else {
				b.append(c);
			}
		}
		return b.toString();
	}

	public boolean hasNext() { return event != END_DOCUMENT; }
	public int getEventType() { return event; }
	public void close() {}

	public String getElementText() throws XMLStreamException {
		if (event != START_ELEMENT) throw new XMLStreamException("Not at START_ELEMENT");
		StringBuilder b = new StringBuilder();
		for (;;) {
			int e = next();
			if (e == END_ELEMENT) return b.toString();
			if (e == CHARACTERS || e == CDATA || e == SPACE) b.append(text);
			else if (e == START_ELEMENT) throw new XMLStreamException("Element text contains an element");
			else if (e == END_DOCUMENT) throw new XMLStreamException("Unexpected end of document");
		}
	}

	public int nextTag() throws XMLStreamException {
		for (;;) {
			int e = next();
			if (e == START_ELEMENT || e == END_ELEMENT) return e;
			if ((e == CHARACTERS || e == CDATA) && !isWhiteSpace()) throw new XMLStreamException("Non-whitespace text");
			if (e == END_DOCUMENT) throw new XMLStreamException("Unexpected end of document");
		}
	}

	public String getLocalName() { return name; }
	public QName getName() { return new QName(name); }
	public boolean hasName() { return event == START_ELEMENT || event == END_ELEMENT; }
	public int getAttributeCount() { return attrNames.size(); }
	public String getAttributeLocalName(int i) { return attrNames.get(i); }
	public QName getAttributeName(int i) { return new QName(attrNames.get(i)); }
	public String getAttributeValue(int i) { return attrValues.get(i); }
	public String getAttributeValue(String ns, String localName) {
		int i = attrNames.indexOf(localName);
		return i < 0 ? null : attrValues.get(i);
	}
	public String getAttributeNamespace(int i) { return null; }
	public String getAttributePrefix(int i) { return ""; }
	public String getAttributeType(int i) { return "CDATA"; }
	public boolean isAttributeSpecified(int i) { return true; }
	public boolean isStartElement() { return event == START_ELEMENT; }
	public boolean isEndElement() { return event == END_ELEMENT; }
	public boolean isCharacters() { return event == CHARACTERS; }
	public boolean isWhiteSpace() {
		if (text == null) return false;
		for (int i = 0; i < text.length(); i++) if (!isSpace(text.charAt(i))) return false;
		return true;
	}
	public String getText() { return text; }
	public char[] getTextCharacters() { return text == null ? null : text.toCharArray(); }
	public int getTextCharacters(int src, char[] dst, int dstStart, int len) {
		int l = Math.min(len, text.length() - src);
		text.getChars(src, src + l, dst, dstStart);
		return l;
	}
	public int getTextStart() { return 0; }
	public int getTextLength() { return text == null ? 0 : text.length(); }
	public boolean hasText() { return text != null; }

	public Object getProperty(String n) { return null; }
	public void require(int type, String ns, String localName) throws XMLStreamException {
		if (type != event || (localName != null && !localName.equals(name))) throw new XMLStreamException("require failed");
	}
	public String getNamespaceURI(String prefix) { return null; }
	public int getNamespaceCount() { return 0; }
	public String getNamespacePrefix(int i) { return null; }
	public String getNamespaceURI(int i) { return null; }
	public NamespaceContext getNamespaceContext() { return null; }
	public String getEncoding() { return "UTF-8"; }
	public Location getLocation() { return null; }
	public String getNamespaceURI() { return null; }
	public String getPrefix() { return ""; }
	public String getVersion() { return "1.0"; }
	public boolean isStandalone() { return false; }
	public boolean standaloneSet() { return false; }
	public String getCharacterEncodingScheme() { return "UTF-8"; }
	public String getPITarget() { return null; }
	public String getPIData() { return null; }
}
