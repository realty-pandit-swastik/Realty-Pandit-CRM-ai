#!/bin/bash
# Write the current git short SHA into .release.txt so the running backend
# can tag every GlitchTip event with the exact commit that was deployed.
#
# Run from the backend directory (or pass --root <path> for repo root):
#   bash scripts/write-release.sh
#
# Falls back to "unknown" if git is unavailable (e.g., on the server after
# rsync, which excludes .git). Best to run this on the build/dev machine
# BEFORE deploy so the SHA travels with the rsync.

set -e

# Resolve where to write the file: backend root.
BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Try git from the repo root (walks up); fall back to env var, then "unknown".
SHA=$(git -C "$BACKEND_DIR" rev-parse --short HEAD 2>/dev/null || echo "")
if [ -z "$SHA" ]; then
    SHA="${GIT_SHA:-unknown}"
fi

echo "$SHA" > "$BACKEND_DIR/.release.txt"
echo "[write-release] backend release tagged: $SHA"
