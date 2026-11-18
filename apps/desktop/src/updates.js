export function desktopUpdates({ updater, preferences, refresh, note }) {
	let beta = preferences.read() === 'beta';
	let ready = null;
	let busy = false;
	let status = 'idle';

	function selectChannel() {
		updater.channel = beta ? 'beta' : 'latest';
		updater.allowPrerelease = beta;
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
		state: () => ({ beta, ready, status, busy: busy || status === 'installing' }),
		setBeta(value) {
			if (typeof value !== 'boolean' || beta === value || busy || status === 'installing') return;
			try {
				preferences.write(value ? 'beta' : 'latest');
			} catch (error) {
				failed(error);
				return;
			}
			beta = value;
			ready = null;
			selectChannel();
			void check();
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
