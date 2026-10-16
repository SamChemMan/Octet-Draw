#!/bin/sh
# Builds Octet's name-to-structure engine: OPSIN 2.8.0 compiled to JavaScript with TeaVM.
# Needs JDK 21 and Maven at build time only. Writes src/vendor/opsin/opsin.js and opsin-data.bin.
# Then builds names.txt, the list of whole names used to complete and correct what is typed.
# Usage: JAVA_HOME=/path/to/jdk-21 MVN=/path/to/mvn tools/opsin/build.sh
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../../src/vendor/opsin"
mvn="${MVN:-mvn} -B -q"
java="${JAVA_HOME:?Set JAVA_HOME to a JDK 21}/bin/java"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R "$here/pack" "$here/js" "$work/"

# 1. Fetch OPSIN and build the resource pack: OPSIN's XML, and its automata re-encoded without Java serialisation.
(cd "$work/pack" && $mvn package dependency:copy-dependencies -DoutputDirectory=target/lib)
lib="$work/pack/target/lib"
"$java" -cp "$work/pack/target/classes:$lib/*" dk.brics.automaton.PackBuilder "$lib/opsin-core-2.8.0.jar" "$out/opsin-data.bin"

# 2. Remove the classes Octet replaces (see js/src) from the upstream jars, and install the patched jars locally.
cp "$lib/opsin-core-2.8.0.jar" "$work/opsin-core.jar"
cp "$lib/automaton-1.12-4.jar" "$work/automaton.jar"
zip -q -d "$work/opsin-core.jar" 'uk/ac/cam/ch/wwmm/opsin/ResourceGetter.class' 'uk/ac/cam/ch/wwmm/opsin/AutomatonInitialiser.class' 'uk/ac/cam/ch/wwmm/opsin/resources/*'
zip -q -d "$work/automaton.jar" 'dk/brics/automaton/RunAutomaton.class'
$mvn install:install-file -Dfile="$work/opsin-core.jar" -DgroupId=octet.patched -DartifactId=opsin-core -Dversion=2.8.0-octet -Dpackaging=jar
$mvn install:install-file -Dfile="$work/automaton.jar" -DgroupId=octet.patched -DartifactId=automaton -Dversion=1.12-4-octet -Dpackaging=jar

# 3. Compile to an ES module.
(cd "$work/js" && $mvn clean package)
cp "$work/js/target/js/opsin.js" "$out/opsin.js"
ls -l "$out"
node "$here/names.mjs"
