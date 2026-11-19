// Wraps the packaged Linux app as a Debian package (which sets up Chromium's sandbox
// helper, as it needs to be on most distributions) and as a tarball for everywhere else.
// Neither updates itself: like on Windows, a new version is downloaded by hand.
import { Arch, build, Platform } from 'electron-builder';
import { resolve } from 'node:path';

await build({
	prepackaged: resolve('dist/Geordi-linux-x64'),
	targets: Platform.LINUX.createTarget(['deb', 'tar.gz'], Arch.x64),
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
			maintainer: 'Chatto',
			synopsis: 'A calmer way to run coding agents.'
		}
	}
});
