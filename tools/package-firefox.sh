#!/bin/sh
# Zips extension/ into dist/cookie-decliner-<version>.xpi for Firefox builds that
# allow unsigned add-ons (Developer Edition, Nightly, ESR with
# xpinstall.signatures.required=false). Release Firefox needs a signed file.
#
# Allow-list: only the extension's own file types from its own folders are
# packed. Chrome's _metadata/, hidden files (.DS_Store, ._* from exFAT/SMB),
# editor and merge leftovers (*.swp, *.orig, *.rej) never ship.
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./extension/manifest.json').version")
mkdir -p dist
out="$PWD/dist/cookie-decliner-$version.xpi"
rm -f "$out"
cd extension
list=$(mktemp)
trap 'rm -f "$list"' EXIT
# Written to a file first: a failing find must stop the script (sh has no pipefail).
find manifest.json background.js background content icons options rules vendor -type f \
  ! -name '.*' \( -name '*.js' -o -name '*.json' -o -name '*.html' -o -name '*.css' -o -name '*.png' -o -name 'LICENSE' \) \
  > "$list"
LC_ALL=C sort "$list" | zip -q -X "$out" -@
# Every file the manifest or the options page refers to must be in the package.
node -e '
const fs = require("fs");
const m = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const packed = new Set(fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean));
const refs = [m.background.service_worker, ...(m.background.scripts || []), m.options_ui && m.options_ui.page,
  ...Object.values(m.icons || {}), ...m.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  ...m.declarative_net_request.rule_resources.map((r) => r.path)].filter(Boolean);
const missing = refs.filter((f) => !packed.has(f));
if (missing.length) { console.error("not packed: " + missing.join(", ")); process.exit(1); }
' "$list"
echo "$out"
