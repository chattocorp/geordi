import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join, resolve } from 'node:path';
import { daemonDataPaths, options } from './options.js';

test("uses the desktop app's ports by default", () => {
	assert.deepEqual(options({}), {
		web: 7717,
		daemon: 7718,
		live: 7719,
		origin: 'http://localhost:7717'
	});
});

test('takes ports and origin from the environment', () => {
	assert.deepEqual(options({ PORT: '8000', GEORDI_DAEMON_PORT: '8001', ORIGIN: 'http://x:9' }), {
		web: 8000,
		daemon: 8001,
		live: 8002,
		origin: 'http://x:9'
	});
});

test('refuses bad ports', () => {
	assert.throws(() => options({ PORT: 'nope' }), /PORT must be a port number/);
	assert.throws(() => options({ PORT: '7718' }), /must differ/);
});

test('listens on loopback only', () => {
	assert.doesNotThrow(() => options({ HOST: '127.0.0.1' }));
	assert.throws(() => options({ HOST: '0.0.0.0' }), /no authentication/);
});

test('keeps daemon state and credentials with the CLI instance', () => {
	const root = resolve('second-instance');
	const paths = daemonDataPaths({ GEORDI_DATA_DIR: 'second-instance' });
	assert.deepEqual(paths, {
		GEORDI_DAEMON_TOKEN_FILE: join(root, 'daemon-token'),
		GEORDI_WORKTREES_DIR: join(root, 'worktrees'),
		GEORDI_SESSIONS_DIR: join(root, 'sessions'),
		GEORDI_PROJECTS_DIR: join(root, 'projects'),
		GEORDI_RUN_APPROVALS_FILE: join(root, 'run-approvals.json'),
		GEORDI_PORTS_FILE: join(root, 'ports.json')
	});
	for (const key of Object.keys(paths)) {
		const override = resolve('explicit', key);
		assert.deepEqual(daemonDataPaths({ GEORDI_DATA_DIR: root, [key]: override }), {
			...paths,
			[key]: override
		});
	}
	assert.deepEqual(daemonDataPaths({}), {});
});
