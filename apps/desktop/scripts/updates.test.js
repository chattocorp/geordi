import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { desktopUpdates } from '../src/updates.js';

test('release checks remember beta, prevent downgrades and restart only on request', async () => {
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
		note() {},
		offerRestart: async () => false
	});
	assert.equal(updater.allowPrerelease, true);
	assert.equal(updater.channel, 'beta');
	assert.equal(updater.autoInstallOnAppQuit, false);
	updates.menuItems().at(-1).click({ checked: false });
	assert.equal(saved, 'latest');
	assert.equal(updater.allowPrerelease, false);
	assert.equal(updater.allowDowngrade, false);
	await updates.check();
	assert.equal(checks, 1);
	updater.emit('update-downloaded', { version: '1.0.0' });
	await Promise.resolve();
	assert.equal(installs, 0);
	updates.menuItems()[0].click();
	assert.equal(installs, 1);
});
