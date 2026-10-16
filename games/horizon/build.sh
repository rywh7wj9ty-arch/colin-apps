#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
# Ensure three.min.js present
if [ ! -f "$ROOT/three.min.js" ]; then
  cp /workspace/cybertruck-3d/three.min.js "$ROOT/three.min.js"
fi
# Sync to netlify-site
DEST=/workspace/netlify-site/horizon
mkdir -p "$DEST/src"
cp "$ROOT/index.html" "$DEST/"
cp "$ROOT/three.min.js" "$DEST/"
cp "$ROOT/src/shaders.js" "$DEST/src/"
cp "$ROOT/src/app.js" "$DEST/src/"
echo "Built → $DEST"
