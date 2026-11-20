import { sign } from '@electron/osx-sign';

const [app, keychain] = process.argv.slice(2);
await sign({
	app,
	keychain,
	identity: 'Developer ID Application: ChattoCorp GmbH (59ZZ2V8BY7)',
	platform: 'darwin'
});
