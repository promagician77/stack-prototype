#!/usr/bin/env bash
# Compiles the engine-independent core + EditMode tests with Mono and runs them.
set -e
cd "$(dirname "$0")"
mcs -nologo -out:/tmp/stackdrop-tests.exe NUnitShim.cs Runner.cs ../Assets/Scripts/Core/*.cs ../Assets/Tests/EditMode/*.cs
mono /tmp/stackdrop-tests.exe
