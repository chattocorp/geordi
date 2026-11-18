import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	cpSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installApp, launchEnv } from './install.js';

async function fixture(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'geordi-install-test-'));
	const packaged = join(dir, 'new.app');
	const installed = join(dir, 'Geordi.app');
	for (const [path, content] of [
		[packaged, 'new'],
		[installed, 'old']
	]) {
		mkdirSync(path);
		writeFileSync(join(path, 'version'), content);
	}
	try {
		await fn({ dir, packaged, installed });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const stopped = () => {
	throw Object.assign(new Error('not running'), { status: 1 });
};

test('copies and signs before quitting, then replaces and opens the app', () =>
	fixture(async ({ packaged, installed }) => {
		const calls = [];
		let running = true;
		await installApp(packaged, installed, (cmd, args) => {
			calls.push(cmd);
			if (cmd === 'ditto') cpSync(args[0], args[1], { recursive: true });
			if (cmd === 'pgrep' && !running) stopped();
			if (cmd === 'osascript') {
				assert.equal(readFileSync(join(installed, 'version'), 'utf8'), 'old');
				running = false;
			}
			if (cmd === 'open') assert.equal(readFileSync(join(installed, 'version'), 'utf8'), 'new');
		});
		assert.deepEqual(calls, ['ditto', 'codesign', 'pgrep', 'osascript', 'pgrep', 'pgrep', 'open']);
	}));

test('leaves the old app in place if it refuses to quit', () =>
	fixture(async ({ dir, packaged, installed }) => {
		await assert.rejects(
			installApp(
				packaged,
				installed,
				(cmd, args) => {
					if (cmd === 'ditto') cpSync(args[0], args[1], { recursive: true });
				},
				async () => {}
			),
			/did not quit/
		);
		assert.equal(readFileSync(join(installed, 'version'), 'utf8'), 'old');
		assert.deepEqual(readdirSync(dir).sort(), ['Geordi.app', 'new.app']);
	}));

test('a signing failure never quits or replaces the running app', () =>
	fixture(async ({ packaged, installed }) => {
		await assert.rejects(
			installApp(packaged, installed, (cmd, args) => {
				if (cmd === 'ditto') cpSync(args[0], args[1], { recursive: true });
				else if (cmd === 'codesign') throw new Error('signing failed');
				else assert.fail(`Unexpected ${cmd}`);
			}),
			/signing failed/
		);
		assert.equal(readFileSync(join(installed, 'version'), 'utf8'), 'old');
	}));

test('installs without asking a stopped app to launch and quit', () =>
	fixture(async ({ packaged, installed }) => {
		await installApp(packaged, installed, (cmd, args) => {
			if (cmd === 'ditto') cpSync(args[0], args[1], { recursive: true });
			if (cmd === 'pgrep') stopped();
			if (cmd === 'osascript') assert.fail('Should not send a quit request');
		});
		assert.equal(readFileSync(join(installed, 'version'), 'utf8'), 'new');
	}));

test('restores the old bundle if the replacement cannot be moved into place', () =>
	fixture(async ({ packaged, installed }) => {
		let replacement;
		let running = true;
		await assert.rejects(
			installApp(packaged, installed, (cmd, args) => {
				if (cmd === 'ditto') {
					replacement = args[1];
					cpSync(args[0], replacement, { recursive: true });
				}
				if (cmd === 'pgrep' && !running) stopped();
				if (cmd === 'osascript') {
					running = false;
					rmSync(replacement, { recursive: true });
				}
			}),
			/ENOENT/
		);
		assert.equal(readFileSync(join(installed, 'version'), 'utf8'), 'old');
	}));

test("opens the app without its caller's environment", () => {
	assert.deepEqual(
		launchEnv({ HOME: '/h', PATH: '/bin', ELECTRON_RUN_AS_NODE: '1', GEORDI_PORT: '20016' }),
		{ HOME: '/h', PATH: '/bin' }
	);
});
