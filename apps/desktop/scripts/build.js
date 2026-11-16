import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
const stage = join(root, 'stage');
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...options });
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// --- Stage: everything the app consists of, in one directory ---------------------------------

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage);
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
cpSync(join(root, 'src/preload.cjs'), join(stage, 'preload.cjs'));

// The sounds of its notifications: made by the web app's own code, as files for the system
// to play (see main.js). Louder than in a browser, where they play over whatever else does.
const { chimeWav } = await import(join(repo, 'apps/web/src/lib/chime.ts'));
const sounds = ['done', 'failed'].map((name) => {
	const file = join(stage, `geordi-${name}.wav`);
	writeFileSync(file, chimeWav(name === 'failed', 0.3));
	return file;
});

// The forge: its production build, which needs nothing but Node.
run('pnpm', ['--filter', '@geordi/web', 'build'], { cwd: repo });
cpSync(join(repo, 'apps/web/build'), join(stage, 'forge'), { recursive: true });

// The daemon: one file. Its TypeScript can't run from inside an app as it does from the
// repository (Node won't strip types below node_modules, where the protocol would end up).
await build({
	entryPoints: [join(repo, 'apps/daemon/src/main.ts')],
	outfile: join(stage, 'daemon/main.js'),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node24',
	external: ['@lydell/node-pty'],
	// for the CommonJS among what it bundles
	banner: {
		js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
	}
});

// The one thing the daemon can't have bundled: terminals, with their native code. Its
// binary for this machine is a package of its own, next to it in pnpm's store.
const pty = realpathSync(join(repo, 'apps/daemon/node_modules/@lydell/node-pty'));
const binary = `node-pty-${process.platform}-${process.arch}`;
for (const [from, name] of [
	[pty, 'node-pty'],
	[join(dirname(pty), binary), binary]
])
	cpSync(from, join(stage, 'node_modules/@lydell', name), { recursive: true, dereference: true });

// --- Package ----------------------------------------------------------------------------------

const install = process.argv.includes('--install');
if (install || process.argv.includes('--package')) {
	const electron = join(root, 'node_modules/electron/package.json');
	const [built] = await packager({
		dir: stage,
		out: join(root, 'dist'),
		name: 'Geordi',
		appBundleId: 'com.github.chattocorp.geordi',
		icon: join(root, 'icon.icns'),
		electronVersion: JSON.parse(readFileSync(electron, 'utf8')).version,
		overwrite: true,
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
	const packaged = join(built, 'Geordi.app');
	console.log(`packaged ${packaged}`);

	if (install) {
		const installed = '/Applications/Geordi.app';
		// Quitting leaves the agents working; the new version picks them up again (ADR-007).
		try {
			run('osascript', ['-e', 'tell application id "com.github.chattocorp.geordi" to quit'], {
				stdio: 'ignore'
			});
		} catch {
			// it wasn't installed yet
		}
		for (let n = 0; n < 50 && running(); n++) await new Promise((r) => setTimeout(r, 200));
		rmSync(installed, { recursive: true, force: true });
		run('ditto', [packaged, installed]);
		// Signed as a whole, if only by ourselves: macOS takes an app it cannot tell from another
		// for nobody, and shows none of its notifications.
		run('codesign', ['--force', '--deep', '--sign', '-', installed]);
		run('open', [installed]);
		console.log(`installed ${installed}`);
	}
}

function running() {
	try {
		run('pgrep', ['-f', '/Applications/Geordi.app/Contents/MacOS/Geordi'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}
