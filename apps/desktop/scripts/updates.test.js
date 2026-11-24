import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { desktopUpdates } from '../src/updates.js';

test('release checks follow the selected channel, prevent downgrades and restart only on request', async () => {
	const updater = new EventEmitter();
	let installs = 0;
	updater.quitAndInstall = () => installs++;
	let saved = 'beta';
	let checks = 0;
	updater.checkForUpdates = async () => {
		checks++;
	};
	const updates = desktopUpdates({
		updater,
		preferences: { read: () => saved, write: (channel) => (saved = channel) },
		refresh() {},
		note() {}
	});
	assert.equal(updater.allowPrerelease, true);
	assert.equal(updater.channel, 'beta');
	assert.equal(updater.autoInstallOnAppQuit, false);
	updates.setChannel('invalid');
	assert.equal(saved, 'beta');
	await updates.setChannel('alpha');
	assert.equal(saved, 'alpha');
	assert.equal(updater.channel, 'alpha');
	assert.equal(updates.state().channel, 'alpha');
	assert.equal(updater.allowPrerelease, true);
	assert.equal(updater.allowDowngrade, false);
	await updates.setChannel('latest');
	assert.equal(saved, 'latest');
	assert.equal(updater.allowPrerelease, false);
	assert.equal(updater.allowDowngrade, false);
	assert.equal(checks, 2);
	updater.emit('update-downloaded', { version: '1.0.0' });
	await Promise.resolve();
	assert.equal(installs, 0);
	assert.equal(updates.state().ready, '1.0.0');
	updates.restart();
	assert.equal(installs, 1);
});
