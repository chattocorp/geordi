import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { desktopRuntime } from '../src/runtime.js';

export function devEnvironment(env, repo) {
	// the task's own ports (`.geordi.yml`): the forge's pages, and its two WebSockets
	const [web, daemon, live] = ['PORT_FORGE', 'PORT_DAEMON', 'PORT_LIVE'].map((name) => {
		const port = Number(env[name]);
		if (!Number.isInteger(port) || port < 1024 || port > 65535)
			throw new Error(`Start Electron dev app from Geordi's Tasks tab (${name} is missing).`);
		return port;
	});
	const result = {
		...env,
		GEORDI_DESKTOP_DEV_DIR: join(repo, '.data/desktop'),
		PORT: String(web),
		GEORDI_DAEMON_PORT: String(daemon),
		GEORDI_LIVE_PORT: String(live)
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
