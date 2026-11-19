import { rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';
import { seed } from './seed-dev-data.mjs';

// Replace this process so the job terminal's Ctrl+C reaches the service directly.
const root = resolve(import.meta.dirname, '..');
const job = process.argv[2];
if (!['web', 'daemon', 'storybook', 'reset'].includes(job)) {
	throw new Error('Usage: node scripts/workspace-dev.mjs web|daemon|storybook|reset');
}

function port(name) {
	const value = Number(process.env[name]);
	if (!Number.isInteger(value) || value < 1024 || value > 65535) {
		throw new Error(`Missing or invalid ${name}. Start this job from Geordi's Run menu.`);
	}
	return value;
}

const web = port('GEORDI_PORT_WEB');
const daemon = port('GEORDI_PORT_DAEMON');
const storybook = port('GEORDI_PORT_STORYBOOK');
// Reset runs with the web server stopped, so its port can serve browser updates.
const live = port('GEORDI_PORT_RESET');
if (new Set([web, daemon, storybook, live]).size !== 4) {
	throw new Error('The workspace jobs must have distinct assigned ports.');
}

const data = join(root, '.data');
const env = {
	...process.env,
	GEORDI_DATA_DIR: data,
	GEORDI_WORKTREES_DIR: join(data, 'worktrees'),
	GEORDI_SESSIONS_DIR: join(data, 'sessions'),
	GEORDI_DAEMON_TOKEN_FILE: join(data, 'daemon-token'),
	GEORDI_RUN_APPROVALS_FILE: join(data, 'run-approvals.json'),
	GEORDI_PORTS_FILE: join(data, 'ports.json'),
	GEORDI_DAEMON_PORT: String(daemon),
	GEORDI_LIVE_PORT: String(live),
	GEORDI_FORGE_URL: `ws://127.0.0.1:${daemon}`,
	GEORDI_FORGE_HTTP_URL: `http://localhost:${web}`,
	ORIGIN: `http://localhost:${web}`,
	HOST: '127.0.0.1',
	PORT: String(job === 'storybook' ? storybook : web)
};
delete env.GEORDI_DAEMON_TOKEN;

if (job === 'reset') {
	// Stopping the web server stops the daemon too, which needs it.
	if (await listening(web)) throw new Error('Stop the web server first.');
	rmSync(data, { recursive: true, force: true });
	seed(data);
	console.log('The development data is new again.');
	process.exit(0);
}
if (job === 'web') seed(data);

if (job === 'daemon') {
	// Vite loads the forge on its first HTTP request. Initialise its token and
	// WebSocket listeners before Geordi waits for the daemon job's port.
	const deadline = Date.now() + 30_000;
	for (;;) {
		try {
			const response = await fetch(env.GEORDI_FORGE_HTTP_URL, {
				signal: AbortSignal.timeout(5000)
			});
			await response.body?.cancel();
			if (!response.ok) throw new Error(`The test forge returned HTTP ${response.status}`);
			break;
		} catch (cause) {
			if (Date.now() >= deadline) throw new Error('The test forge did not start.', { cause });
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
}

const app = job === 'daemon' ? 'daemon' : 'web';
process.chdir(join(root, 'apps', app));
const args =
	job === 'daemon'
		? ['--watch', 'src/main.ts']
		: job === 'web'
			? [
					'node_modules/vite/bin/vite.js',
					'dev',
					'--host',
					'127.0.0.1',
					'--port',
					String(web),
					'--strictPort'
				]
			: [
					'node_modules/storybook/dist/bin/dispatcher.js',
					'dev',
					'--host',
					'127.0.0.1',
					'--port',
					String(storybook),
					'--ci',
					'--exact-port'
				];
process.execve(process.execPath, [process.execPath, ...args], env);

function listening(port) {
	return new Promise((resolve) => {
		const socket = createConnection({ host: '127.0.0.1', port });
		socket.once('connect', () => (socket.destroy(), resolve(true)));
		socket.once('error', () => resolve(false));
	});
}
