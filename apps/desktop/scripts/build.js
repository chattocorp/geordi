import { execFileSync, spawn } from 'node:child_process';
import {
	cpSync,
	mkdirSync,
	readFileSync,
	rmSync,
	renameSync,
	writeFileSync,
	openSync,
	closeSync
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packager } from '@electron/packager';
import { build } from 'esbuild';

/**
 * Builds the desktop app (ADR-008).
 *
 *   node scripts/build.js             stages the app in `stage/`, to run with `electron stage`
 *   node scripts/build.js --package   also packages it as `dist/…/Geordi.app`
 *   node scripts/build.js --install   also puts that into /Applications, and opens it
 */

const root = join(import.meta.dirname, '..');
const repo = join(root, '../..');
const stage = process.argv.includes('--dev')
	? join(repo, '.data/desktop/stage')
	: join(root, 'stage');
const pnpm = (args) =>
	execFileSync(
		process.platform === 'win32' ? process.env.npm_execpath || 'pnpm.exe' : 'pnpm',
		args,
		{ cwd: repo, stdio: 'inherit' }
	);
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// --- Stage: everything the app consists of, in one directory ---------------------------------

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
writeFileSync(
	join(stage, 'package.json'),
	JSON.stringify({
		name: 'geordi',
		productName: 'Geordi',
		version,
		type: 'module',
		main: 'main.js'
	})
);
cpSync(join(root, 'src/main.js'), join(stage, 'main.js'));
if (process.platform === 'darwin') {
	await build({
		entryPoints: [join(root, 'src/release-updater.cjs')],
		outfile: join(stage, 'release-updater.cjs'),
		bundle: true,
		platform: 'node',
		format: 'cjs',
		external: ['electron']
	});
}
cpSync(join(root, 'src/updates.js'), join(stage, 'updates.js'));
cpSync(join(root, 'src/runtime.js'), join(stage, 'runtime.js'));
cpSync(join(root, 'src/preload.cjs'), join(stage, 'preload.cjs'));

// The sounds of its notifications: made by the web app's own code, as files for the system
// to play (see main.js). Louder than in a browser, where they play over whatever else does.
const { chimeWav } = await import(pathToFileURL(join(repo, 'apps/web/src/lib/chime.ts')).href);
const sounds = ['done', 'failed'].map((name) => {
	const file = join(stage, `geordi-${name}.wav`);
	writeFileSync(file, chimeWav(name === 'failed', 0.3));
	return file;
});

// The forge: its production build, which needs nothing but Node.
pnpm(['--filter', '@geordi/web', 'build']);
cpSync(join(repo, 'apps/web/build'), join(stage, 'forge'), { recursive: true });

// The daemon: one file each for it and what it starts. Its TypeScript can't run from inside an app as it does from the
// repository (Node won't strip types below node_modules, where the protocol would end up).
await build({
	// and next to it the host of an agent's session, a process of its own (ADR-010)
	entryPoints: [join(repo, 'apps/daemon/src/main.ts'), join(repo, 'apps/daemon/src/host.ts')],
	outdir: join(stage, 'daemon'),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node24',
	external: ['@lydell/node-pty'],
	// for the CommonJS among what it bundles
	banner: {
		js: "import { createRequire as makeBundleRequire } from 'node:module'; const require = makeBundleRequire(import.meta.url);"
	}
});

// The wrappers resolve the provider binaries and native modules relative to their own
// packages. Deploy the production dependency tree with the same lockfile as the daemon.
pnpm([
	...(process.platform === 'win32' ? ['--config.node-linker=hoisted'] : []),
	'--filter',
	'@geordi/daemon',
	'deploy',
	'--legacy',
	'--prod',
	join(stage, 'runtime')
]);
renameSync(join(stage, 'runtime/node_modules'), join(stage, 'node_modules'));
rmSync(join(stage, 'runtime'), { recursive: true });

// --- Package ----------------------------------------------------------------------------------

const install = process.argv.includes('--install');
if (install || process.argv.includes('--package')) {
	const electron = join(root, 'node_modules/electron/package.json');
	const [built] = await packager({
		dir: stage,
		out: join(root, 'dist'),
		name: 'Geordi',
		appBundleId: 'com.github.chattocorp.geordi',
		icon: process.platform === 'darwin' ? join(root, 'icon.icns') : undefined,
		electronVersion: JSON.parse(readFileSync(electron, 'utf8')).version,
		overwrite: true,
		// Electron Packager dereferences pnpm links or rewrites them to absolute staging paths.
		ignore: /^\/node_modules($|\/)/,
		afterCopy: [
			({ buildPath }) =>
				cpSync(join(stage, 'node_modules'), join(buildPath, 'node_modules'), {
					recursive: true,
					verbatimSymlinks: true
				})
		],
		prune: false, // the stage holds exactly what is needed
		asar: false, // forge and daemon run as processes of their own, from plain files
		quiet: true,
		extraResource: sounds, // where the system looks for an app's notification sounds
		// What macOS says when something asks for these. Geordi itself uses none of them: what
		// it runs (an agent's CLI, a job, a shell) does so in its name, and the person should
		// know that this is who is asking.
		usageDescription: Object.fromEntries(
			['Microphone', 'Camera', 'AudioCapture'].map((what) => [
				what,
				'Geordi itself does not use this. A program running inside it (an agent, a job, or something in a terminal) is asking for it.'
			])
		)
	});
	const packaged = process.platform === 'darwin' ? join(built, 'Geordi.app') : built;
	console.log(`packaged ${packaged}`);

	if (install) {
		// The app owns this terminal. The replacement must survive its shutdown.
		const logFile = join(root, 'dist', 'install.log');
		const log = openSync(logFile, 'w');
		console.log(`Installing and restarting Geordi. Installer log: ${logFile}`);
		const installer = spawn(process.execPath, [join(root, 'scripts/install.js'), packaged], {
			detached: true,
			stdio: ['ignore', log, log]
		});
		closeSync(log);
		await new Promise((resolve, reject) => {
			installer.once('error', reject);
			installer.once('exit', (code) =>
				code === 0 ? resolve() : reject(new Error(`Installation failed; see ${logFile}`))
			);
		});
	}
}
