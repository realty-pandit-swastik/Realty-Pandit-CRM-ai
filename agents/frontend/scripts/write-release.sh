#!/bin/bash
# Write the current git short SHA into .release for the frontend build.
# vite.config.ts reads this file at build time and bakes it into the bundle
# as __APP_RELEASE__ so GlitchTip events are tagged with the deploy commit.
#
# Run on the dev/build machine BEFORE rsync — the production server has no
# git history (push-update.sh excludes .git).

set -e

FRONTEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"

SHA=$(git -C "$FRONTEND_DIR" rev-parse --short HEAD 2>/dev/null || echo "")
if [ -z "$SHA" ]; then
    SHA="${GIT_SHA:-unknown}"
fi

echo "$SHA" > "$FRONTEND_DIR/.release"
echo "[write-release] frontend release tagged: $SHA"
