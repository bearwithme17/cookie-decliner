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
find manifest.json background.js background content icons options rules vendor -type f \
  ! -name '.*' \( -name '*.js' -o -name '*.json' -o -name '*.html' -o -name '*.css' -o -name '*.png' -o -name 'LICENSE' \) \
  | LC_ALL=C sort | zip -q -X "$out" -@
echo "$out"
