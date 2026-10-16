package uk.ac.cam.ch.wwmm.opsin;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import javax.xml.stream.XMLStreamReader;

import org.teavm.jso.JSBody;
import org.teavm.jso.typedarrays.Int8Array;

/** Octet replacement: resources come from a JS callback, nothing touches the file system. */
class ResourceGetter {
	private final String resourcePath;

	ResourceGetter(String resourcePath) {
		if (resourcePath.startsWith("/")) resourcePath = resourcePath.substring(1);
		this.resourcePath = resourcePath;
	}

	String getResourcePath() { return resourcePath; }

	@JSBody(params = "name", script = "return globalThis.opsinResource(name);")
	private static native Int8Array fetch(String name);

	private byte[] bytes(String name) throws IOException {
		Int8Array a = fetch(resourcePath + name);
		if (a == null) throw new IOException("Missing resource: " + resourcePath + name);
		return a.copyToJavaArray();
	}

	XMLStreamReader getXMLStreamReader(String name) throws IOException {
		return new MiniXmlReader(new String(bytes(name), StandardCharsets.UTF_8));
	}

	String getFileContentsAsString(String name) {
		try {
			return new String(bytes(name), StandardCharsets.UTF_8);
		} catch (IOException e) {
			return "";
		}
	}

	InputStream getInputstreamFromFileName(String name) throws IOException {
		return new ByteArrayInputStream(bytes(name));
	}

	OutputStream getOutputStream(String name) throws IOException {
		throw new IOException("Read-only resources");
	}
}
