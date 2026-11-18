import { sign } from '@electron/osx-sign';
import { notarize } from '@electron/notarize';

const [app, keychain, appleApiKey] = process.argv.slice(2);
await sign({
	app,
	keychain,
	identity: 'Developer ID Application: ChattoCorp GmbH (59ZZ2V8BY7)',
	platform: 'darwin'
});
console.log('Submitting the signed app to Apple for notarization.');
await notarize({
	appPath: app,
	appleApiKey,
	appleApiKeyId: process.env.MACOS_NOTARY_API_KEY_ID,
	appleApiIssuer: process.env.MACOS_NOTARY_API_ISSUER_ID
});
