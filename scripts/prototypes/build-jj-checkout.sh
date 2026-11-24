#!/bin/sh
# Build only the optional macOS trial. Keep Cargo output out of the source tree.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
target="$here/../../.context/native/jj-checkout-build"
dest=$1
if cargo --version >/dev/null 2>&1; then
    set -- cargo
else
    set -- mise exec rust@1.99.0 -- cargo
fi
"$@" build --locked --manifest-path "$here/jj-checkout/Cargo.toml" --target-dir "$target"
mkdir -p "$(dirname -- "$dest")"
tmp=$(mktemp "$dest.XXXXXXXX")
trap 'rm -f "$tmp"' EXIT
cp "$target/debug/geordi-jj-checkout" "$tmp"
chmod 755 "$tmp"
mv -f "$tmp" "$dest"
