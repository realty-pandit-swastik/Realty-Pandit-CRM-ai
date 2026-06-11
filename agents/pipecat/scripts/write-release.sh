#!/bin/bash
# Write the current git short SHA into .release.txt so the running Pipecat
# service can tag every GlitchTip event with the exact commit that was deployed.
#
# Run from anywhere; resolves the pipecat dir from the script's own location.
# Falls back to "unknown" if git is unavailable (e.g., on the server after
# rsync, which excludes .git). Best to run this on the build/dev machine
# BEFORE deploy so the SHA travels with the rsync.

set -e

PIPECAT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

SHA=$(git -C "$PIPECAT_DIR" rev-parse --short HEAD 2>/dev/null || echo "")
if [ -z "$SHA" ]; then
    SHA="${GIT_SHA:-unknown}"
fi

echo "$SHA" > "$PIPECAT_DIR/.release.txt"
echo "[write-release] pipecat release tagged: $SHA"
