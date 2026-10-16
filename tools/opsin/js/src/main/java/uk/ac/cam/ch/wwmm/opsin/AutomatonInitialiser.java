package uk.ac.cam.ch.wwmm.opsin;

import java.io.IOException;
import java.io.InputStream;

import dk.brics.automaton.RunAutomaton;

/** Octet replacement: only loads prebuilt automata. Building them from regexes at runtime is dropped. */
class AutomatonInitialiser {
	private final ResourceGetter resourceGetter;

	AutomatonInitialiser(String resourcePath) {
		resourceGetter = new ResourceGetter(resourcePath);
	}

	RunAutomaton loadAutomaton(String automatonName, String regex, boolean tableize, boolean reverseAutomaton) {
		if (reverseAutomaton) {
			automatonName += "_reversed_";
		}
		String hash = Integer.toString(regex.hashCode());
		if (!hash.equals(resourceGetter.getFileContentsAsString(automatonName + "RegexHash.txt"))) {
			throw new IllegalStateException("Prebuilt automaton out of date: " + automatonName);
		}
		try (InputStream in = resourceGetter.getInputstreamFromFileName(automatonName + "SerialisedAutomaton.aut")) {
			return RunAutomaton.load(in);
		} catch (IOException | ClassNotFoundException e) {
			throw new IllegalStateException("Error loading automaton: " + automatonName, e);
		}
	}
}
