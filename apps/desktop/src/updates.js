export function desktopUpdates({ updater, preferences, refresh, note }) {
	const channels = ['latest', 'beta', 'alpha'];
	const saved = preferences.read();
	let channel = channels.includes(saved) ? saved : 'latest';
	let ready = null;
	let busy = false;
	let status = 'idle';

	function selectChannel() {
		updater.channel = channel;
		updater.allowPrerelease = channel !== 'latest';
		updater.allowDowngrade = false;
	}

	function setStatus(next) {
		status = next;
		refresh();
	}

	function failed(error) {
		note(`Update failed: ${error.message}`);
		setStatus('error');
	}

	selectChannel();
	updater.autoInstallOnAppQuit = false;
	updater.on('error', failed);
	updater.on('update-available', () => setStatus('downloading'));
	updater.on('update-downloaded', ({ version }) => {
		ready = version;
		setStatus('ready');
	});

	async function check() {
		if (busy || ready || status === 'installing') return;
		busy = true;
		setStatus('checking');
		try {
			const result = await updater.checkForUpdates();
			await result?.downloadPromise;
			if (status === 'checking') setStatus('current');
		} catch (error) {
			failed(error);
		} finally {
			busy = false;
			refresh();
		}
	}

	return {
		check,
		state: () => ({ channel, ready, status, busy: busy || status === 'installing' }),
		setChannel(value) {
			if (!channels.includes(value) || channel === value || busy || status === 'installing') return;
			try {
				preferences.write(value);
			} catch (error) {
				failed(error);
				return;
			}
			channel = value;
			ready = null;
			selectChannel();
			return check();
		},
		restart() {
			if (!ready || busy || status === 'installing') return;
			setStatus('installing');
			try {
				updater.quitAndInstall();
			} catch (error) {
				failed(error);
			}
		}
	};
}
