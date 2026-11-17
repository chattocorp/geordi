import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { desktopRuntime } from '../src/runtime.js';

export function devEnvironment(env, repo) {
	let assigned;
	try {
		assigned = JSON.parse(env.GEORDI_ASSIGNED_PORTS);
	} catch {
		throw new Error(
			'Start Electron dev app from Geordi with an updated daemon (GEORDI_ASSIGNED_PORTS is missing).'
		);
	}
	if (
		!Array.isArray(assigned) ||
		!assigned.every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535) ||
		new Set(assigned).size !== assigned.length
	)
		throw new Error('Invalid GEORDI_ASSIGNED_PORTS');
	const used = new Set(
		Object.entries(env)
			.filter(([key]) => key.startsWith('GEORDI_PORT_'))
			.map(([, value]) => Number(value))
	);
	const spare = assigned.filter((port) => !used.has(port));
	const web = Number(env.GEORDI_PORT_DESKTOP);
	if (!assigned.includes(web) || spare.length < 2)
		throw new Error('The desktop job needs its assigned port and two spare workspace ports.');
	const result = {
		...env,
		GEORDI_DESKTOP_DEV_DIR: join(repo, '.data/desktop'),
		PORT: String(web),
		GEORDI_DAEMON_PORT: String(spare[0]),
		GEORDI_LIVE_PORT: String(spare[1])
	};
	delete result.ELECTRON_RUN_AS_NODE;
	desktopRuntime(result); // validate before building anything
	return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const root = resolve(import.meta.dirname, '..');
	const repo = resolve(root, '../..');
	const env = devEnvironment(process.env, repo);
	execFileSync(process.execPath, [join(root, 'scripts/build.js'), '--dev'], {
		stdio: 'inherit',
		cwd: repo
	});
	const electron = createRequire(import.meta.url)('electron');
	process.execve(electron, [electron, join(repo, '.data/desktop/stage')], env);
}
