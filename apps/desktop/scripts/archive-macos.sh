#!/bin/bash
# Run from apps/desktop on the macOS release runner.
set -euo pipefail
umask 077
: "${MACOS_SIGNING_CERTIFICATE_P12_BASE64:?}" "${MACOS_SIGNING_CERTIFICATE_PASSWORD:?}"
: "${MACOS_NOTARY_API_KEY_BASE64:?}" "${MACOS_NOTARY_API_KEY_ID:?}" "${MACOS_NOTARY_API_ISSUER_ID:?}"

work=$(mktemp -d "${RUNNER_TEMP:?}/geordi-signing.XXXXXX")
keychain="$work/signing.keychain-db"
cleanup() {
  security delete-keychain "$keychain" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

password=$(openssl rand -hex 32)
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$password" "$keychain"
printf '%s' "$MACOS_SIGNING_CERTIFICATE_P12_BASE64" | base64 -D > "$work/identity.p12"
security import "$work/identity.p12" -k "$keychain" -P "$MACOS_SIGNING_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain"
rm "$work/identity.p12"
printf '%s' "$MACOS_NOTARY_API_KEY_BASE64" | base64 -D > "$work/notary.p8"
unset password MACOS_SIGNING_CERTIFICATE_P12_BASE64 MACOS_SIGNING_CERTIFICATE_PASSWORD MACOS_NOTARY_API_KEY_BASE64

app=dist/Geordi-darwin-arm64/Geordi.app
node scripts/sign-macos.js "$app" "$keychain" "$work/notary.p8"

version=$(node -p "require('./package.json').version")
archive="dist/Geordi-v${version}-macOS-arm64.zip"
ditto -c -k --sequesterRsrc --keepParent "$app" "$archive"
ditto -x -k "$archive" "$work/extracted"
app="$work/extracted/Geordi.app"
codesign --verify --deep --strict --verbose=2 "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"
cd "$app/Contents/Resources/app"
ELECTRON_RUN_AS_NODE=1 ../../MacOS/Geordi -e "require('@lydell/node-pty')"
