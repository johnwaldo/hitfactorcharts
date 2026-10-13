#!/usr/bin/env bash
# Packages the Hit Factor Charts Chrome extension into a distributable ZIP.
# Output: dist/hitfactorcharts-vX.Y.Z.zip
#
# Usage:
#   ./build.sh              — uses version from manifest.json  (e.g. v1.2)
#   ./build.sh 1.2.1        — overrides version label          (e.g. v1.2.1)
#   ./build.sh alpha        — appends suffix to manifest ver   (e.g. v1.2-alpha)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/extension"
OUT="$SCRIPT_DIR/dist"
MANIFEST_VERSION=$(node -p "require('$SRC/manifest.json').version")
ARG="${1:-}"

# If argument looks like a full semver (digits and dots only), use it as the label.
# Otherwise treat it as a suffix tag appended to the manifest version.
if [[ "$ARG" =~ ^[0-9]+\.[0-9]+(\..*)?$ ]]; then
	LABEL="v${ARG}"
elif [[ -n "$ARG" ]]; then
	LABEL="v${MANIFEST_VERSION}-${ARG}"
else
	LABEL="v${MANIFEST_VERSION}"
fi

ZIP="$OUT/hitfactorcharts-${LABEL}.zip"

if [ ! -f "$SRC/manifest.json" ]; then
	echo "Error: extension/manifest.json not found. Run this script from the repo root." >&2
	exit 1
fi

mkdir -p "$OUT"

# Remove previous build for this label
[ -f "$ZIP" ] && rm "$ZIP"

# Create zip from the extension directory
(cd "$SRC" && zip -r "$ZIP" . \
	--exclude "*.DS_Store" \
	--exclude "__pycache__/*" \
	--exclude "*.pyc" \
	--exclude ".git/*" \
	--exclude "icons/icon-source.svg")

echo "Built: $ZIP ($LABEL)"
echo "Size:  $(du -sh "$ZIP" | cut -f1)"
