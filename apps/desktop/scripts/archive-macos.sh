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
install -m 644 app-update.yml "$app/Contents/Resources/app-update.yml"
node scripts/sign-macos.js "$app" "$keychain"

version=$(node -p "require('./package.json').version")
bash scripts/dmg-macos.sh
image="dist/Geordi-v${version}-macOS-arm64.dmg"
codesign --sign 'Developer ID Application: ChattoCorp GmbH (59ZZ2V8BY7)' --keychain "$keychain" --timestamp "$image"
notary_auth=(--key "$work/notary.p8" --key-id "$MACOS_NOTARY_API_KEY_ID" --issuer "$MACOS_NOTARY_API_ISSUER_ID")
submission=$(xcrun notarytool submit "$image" "${notary_auth[@]}" --output-format json | jq -er '.id')
echo "Waiting for Apple notarization $submission"
# A status request can time out after Apple has received the image.
wait_for_ticket() {
  xcrun notarytool wait "$submission" "${notary_auth[@]}" --output-format json > "$work/status.json"
}
wait_for_ticket || wait_for_ticket
cat "$work/status.json"
jq -e '.status == "Accepted"' "$work/status.json" > /dev/null
xcrun stapler staple "$image"
xcrun stapler validate "$image"
spctl --assess --type open --context context:primary-signature --verbose=2 "$image"

# The DMG submission also covers this signed app. Staple it before generating the updater files.
xcrun stapler staple "$app"
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
