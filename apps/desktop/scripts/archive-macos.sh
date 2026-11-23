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

notary_auth=(--key "$work/notary.p8" --key-id "$MACOS_NOTARY_API_KEY_ID" --issuer "$MACOS_NOTARY_API_ISSUER_ID")
# Submits a file to Apple's notary service and waits until it is accepted.
notarize() {
  local submission
  submission=$(xcrun notarytool submit "$1" "${notary_auth[@]}" --output-format json | jq -er '.id')
  echo "Waiting for Apple notarization $submission of $1"
  # A status request can time out after Apple has received the file.
  xcrun notarytool wait "$submission" "${notary_auth[@]}" --output-format json > "$work/status.json" ||
    xcrun notarytool wait "$submission" "${notary_auth[@]}" --output-format json > "$work/status.json"
  cat "$work/status.json"
  jq -e '.status == "Accepted"' "$work/status.json" > /dev/null
}

app=dist/Geordi-darwin-arm64/Geordi.app
install -m 644 app-update.yml "$app/Contents/Resources/app-update.yml"
node scripts/sign-macos.js "$app" "$keychain"

# The app carries its own ticket into the DMG and the update archive: Gatekeeper then needs
# no word from Apple to open it, which a Mac offline or behind a firewall may not get.
ditto -c -k --keepParent "$app" "$work/notarize.zip"
notarize "$work/notarize.zip"
xcrun stapler staple "$app"
xcrun stapler validate "$app"

version=$(node -p "require('./package.json').version")
bash scripts/dmg-macos.sh
image="dist/Geordi-v${version}-macOS-arm64.dmg"
codesign --sign 'Developer ID Application: ChattoCorp GmbH (59ZZ2V8BY7)' --keychain "$keychain" --timestamp "$image"
notarize "$image"
xcrun stapler staple "$image"
xcrun stapler validate "$image"
spctl --assess --type open --context context:primary-signature --verbose=2 "$image"
# the app as it is in the DMG, ticket and all
mounted="$work/mounted"
hdiutil attach -nobrowse -readonly -mountpoint "$mounted" "$image" > /dev/null
xcrun stapler validate "$mounted/Geordi.app"
hdiutil detach "$mounted" > /dev/null

archive="dist/Geordi-v${version}-macOS-arm64.zip"
node scripts/update-archive.js
ditto -x -k "$archive" "$work/extracted"
app="$work/extracted/Geordi.app"
codesign --verify --deep --strict --verbose=2 "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"
(
  cd "$app/Contents/Resources/app"
  ELECTRON_RUN_AS_NODE=1 ../../MacOS/Geordi -e "require('@lydell/node-pty')"
)
