#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../apps/android/food-health-sync" && pwd)"
cd "$ROOT"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export PATH="$JAVA_HOME/bin:$PATH"
TMP=/tmp/food-gradle-8.11.1
rm -rf "$TMP" /tmp/gradle-8.11.1-bin.zip
wget -q https://services.gradle.org/distributions/gradle-8.11.1-bin.zip -O /tmp/gradle-8.11.1-bin.zip
mkdir -p "$TMP"
unzip -q /tmp/gradle-8.11.1-bin.zip -d /tmp
/tmp/gradle-8.11.1/bin/gradle wrapper --gradle-version 8.11.1
chmod +x gradlew
echo "Wrapper ready. Build with: ./gradlew clean assembleDebug"
