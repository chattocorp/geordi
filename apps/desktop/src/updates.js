// The preference belongs to this installation and survives a switch back to a stable build.
export function desktopUpdates({ updater, preferences, refresh, note, offerRestart }) {
	let beta = preferences.read() === 'beta';
	let ready = null;
	let checking = false;
	let installing = false;

	function selectChannel() {
		updater.channel = beta ? 'beta' : 'latest';
		updater.allowPrerelease = beta;
		// Assigning a channel enables downgrades in electron-updater.
		updater.allowDowngrade = false;
	}

	selectChannel();
	updater.autoInstallOnAppQuit = false;
	updater.on('error', (error) => {
		note(`Update failed: ${error.message}`);
		installing = false;
		refresh();
	});
	updater.on('update-downloaded', async ({ version }) => {
		ready = version;
		refresh();
		if ((await offerRestart(version)) && ready === version) restart();
	});

	function restart() {
		if (installing || !ready) return;
		installing = true;
		refresh();
		updater.quitAndInstall();
	}

	async function check() {
		if (checking || ready || installing) return;
		checking = true;
		refresh();
		try {
			const result = await updater.checkForUpdates();
			await result?.downloadPromise;
		} catch (error) {
			note(`Could not check or download the update: ${error.message}`);
		} finally {
			checking = false;
			refresh();
		}
	}

	return {
		check,
		menuItems() {
			return [
				...(ready
					? [
							{
								label: `Restart to Update to ${ready}`,
								enabled: !installing,
								click: restart
							}
						]
					: []),
				{
					label: 'Receive Beta Updates',
					type: 'checkbox',
					checked: beta,
					enabled: !checking && !installing,
					click(item) {
						preferences.write(item.checked ? 'beta' : 'latest');
						beta = item.checked;
						ready = null;
						selectChannel();
						void check();
					}
				}
			];
		}
	};
}
