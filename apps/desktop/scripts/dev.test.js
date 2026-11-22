import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devEnvironment } from './dev.js';
import { desktopRuntime } from '../src/runtime.js';

const env = {
	PORT: '24000',
	GEORDI_PORT_DESKTOP: '24000',
	GEORDI_PORT_DESKTOP_DAEMON: '24002',
	GEORDI_PORT_DESKTOP_LIVE: '24003',
	GEORDI_PORT_WEB: '20000',
	GEORDI_DATA_DIR: '/installed',
	GEORDI_DAEMON_TOKEN: 'installed-secret',
	ELECTRON_RUN_AS_NODE: '1'
};

test("uses the task's own ports", () => {
	const result = devEnvironment(env, '/workspace');
	assert.equal(result.PORT, '24000');
	assert.equal(result.GEORDI_DAEMON_PORT, '24002');
	assert.equal(result.GEORDI_LIVE_PORT, '24003');
	assert.equal(result.ELECTRON_RUN_AS_NODE, undefined);
	const runtime = desktopRuntime(result);
	assert.equal(runtime.profile, '/workspace/.data/desktop/profile');
	assert.equal(runtime.env.GEORDI_DAEMON_TOKEN, '');
	for (const [key, value] of Object.entries(runtime.env)) {
		if (key !== 'GEORDI_DAEMON_TOKEN') assert.ok(value.startsWith('/workspace/.data/desktop'));
	}
});

test('missing or invalid ports fail before building', () => {
	for (const port of [undefined, 'x', '1', '70000']) {
		assert.throws(() => devEnvironment({ ...env, GEORDI_PORT_DESKTOP_LIVE: port }, '/workspace'));
	}
	assert.throws(
		() => devEnvironment({ ...env, GEORDI_PORT_DESKTOP_LIVE: '24002' }, '/workspace'),
		/distinct/
	);
});

test('installed desktop keeps its existing ports and profile behavior', () => {
	assert.deepEqual(desktopRuntime({ PORT: '20000' }), {
		web: 7717,
		daemon: 7718,
		live: 7719,
		env: {}
	});
});

test('dev desktop refuses incomplete or colliding configuration', () => {
	assert.throws(() => desktopRuntime({ GEORDI_DESKTOP_DEV_DIR: 'relative' }), /absolute/);
	assert.throws(() => desktopRuntime({ GEORDI_DESKTOP_DEV_DIR: '/test' }), /PORT/);
	assert.throws(
		() =>
			desktopRuntime({
				GEORDI_DESKTOP_DEV_DIR: '/test',
				PORT: '20000',
				GEORDI_DAEMON_PORT: '20000',
				GEORDI_LIVE_PORT: '20001'
			}),
		/distinct/
	);
});
