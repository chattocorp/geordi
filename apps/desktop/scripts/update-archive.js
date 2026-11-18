// Wrap the complete signed app. Repacking its resources would break the signature
// and the relative links between the bundled agent wrappers and their dependencies.
import { Arch, build, Platform } from 'electron-builder';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const channel = /^\d+\.\d+\.\d+$/.test(version) ? 'latest' : 'beta';
if (channel === 'beta' && !/^\d+\.\d+\.\d+-beta\.\d+$/.test(version)) {
	throw new Error(`Unsupported release version: ${version}`);
}
await build({
	prepackaged: resolve('dist/Geordi-darwin-arm64/Geordi.app'),
	targets: Platform.MAC.createTarget(['zip'], Arch.arm64),
	publish: 'never',
	config: {
		productName: 'Geordi',
		appId: 'com.github.chattocorp.geordi',
		artifactName: 'Geordi-v${version}-macOS-${arch}.${ext}',
		publish: { provider: 'github', owner: 'chattocorp', repo: 'geordi', channel },
		directories: { output: 'dist' }
	}
});
