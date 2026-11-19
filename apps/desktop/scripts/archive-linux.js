// Linux downloads are updated by hand.
import { Arch, build, Platform } from 'electron-builder';
import { resolve } from 'node:path';

await build({
	prepackaged: resolve('dist/Geordi-linux-x64'),
	targets: Platform.LINUX.createTarget(['deb', 'tar.gz', 'AppImage'], Arch.x64),
	publish: 'never',
	config: {
		productName: 'Geordi',
		appId: 'com.github.chattocorp.geordi',
		artifactName: 'Geordi-v${version}-Linux-x64.${ext}',
		directories: { output: 'dist' },
		linux: {
			executableName: 'geordi',
			icon: 'icon.icns',
			category: 'Development',
			maintainer: 'ChattoCorp GmbH',
			synopsis: 'A calmer way to run coding agents.'
		}
	}
});
