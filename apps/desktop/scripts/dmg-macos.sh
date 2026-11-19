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
for attempt in 1 2 3; do
  candidate="$work/Geordi-$attempt.dmg"
  if LC_ALL=C hdiutil create -volname Geordi -fs HFS+ -format ULMO -srcfolder "$work/volume" "$candidate" 2>"$work/hdiutil.log"; then
    cat "$work/hdiutil.log" >&2
    mv "$candidate" "$image"
    break
  else
    status=$?
  fi
  cat "$work/hdiutil.log" >&2
  if [[ $attempt == 3 ]] || ! grep -Fq 'create failed - Resource busy' "$work/hdiutil.log"; then
    exit "$status"
  fi
  echo "Disk image creation was busy. Retrying in 5 seconds." >&2
  sleep 5
done
echo "Created $image"
