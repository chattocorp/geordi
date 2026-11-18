#!/bin/bash
# Run from apps/desktop after packaging the app for this Mac.
set -euo pipefail
umask 022
arch=$(node -p 'process.arch')
version=$(node -p "require('./package.json').version")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/volume"
app="$work/volume/Geordi.app"
ditto "dist/Geordi-darwin-$arch/Geordi.app" "$app"
if [[ ${1:-} == --local ]]; then
  codesign --force --deep --sign - "$app"
fi
ln -s /Applications "$work/volume/Applications"
image="dist/Geordi-v${version}-macOS-${arch}.dmg"
# LZMA: a third smaller than UDZO's zlib, and macOS 10.15+ opens it (Electron needs 12+).
hdiutil create -volname Geordi -fs HFS+ -format ULMO -srcfolder "$work/volume" "$work/Geordi.dmg"
mv "$work/Geordi.dmg" "$image"
echo "Created $image"
