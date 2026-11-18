import { desktopUpdates } from './updates.js';
import { desktopRuntime } from './runtime.js';
import { forgeReady, services } from './services.js';
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Menu,
	Notification,
	screen,
	shell,
	utilityProcess
} from 'electron';

/**
 * Geordi as a desktop app (ADR-008): a window onto a forge and a daemon that this process
 * starts, both exactly as they run on their own. Next to this file, `forge/` holds the web
 * app's production build and `daemon/` the daemon; see `@geordi/launch`.
 *
 * Quitting leaves agents working (ADR-007): the next launch picks their turns up again.
 * Only "Stop Daemon" ends them, as Ctrl+C does for a daemon in a terminal.
 */

const runtime = desktopRuntime(process.env);
const WEB_PORT = runtime.web;
const DAEMON_PORT = runtime.daemon;
if (runtime.directory) {
	mkdirSync(runtime.profile, { recursive: true });
	app.setName('Geordi Dev');
	app.setPath('userData', runtime.profile);
	app.setPath('sessionData', runtime.profile);
	app.setAppLogsPath(join(runtime.directory, 'logs'));
	process.on('SIGINT', () => app.quit());
	process.on('SIGTERM', () => app.quit());
}
const url = `http://127.0.0.1:${WEB_PORT}`;
const service = services({ web: WEB_PORT, daemon: DAEMON_PORT, live: runtime.live });

const here = import.meta.dirname;

mkdirSync(app.getPath('logs'), { recursive: true });
const logFile = join(app.getPath('logs'), 'geordi.log');
const log = createWriteStream(logFile, { flags: 'a' });
const note = (/** @type {string} */ text) => log.write(`[app] ${text}\n`);

/**
 * The environment of a login shell. An app started from the Finder gets next to none of
 * it, and agents need all of it: `PATH` to find `claude`, `codex`, `git` and `gh`, and
 * whatever keys are set there.
 */
function shellEnv() {
	const mark = '__GEORDI_ENV__';
	try {
		const out = execFileSync(
			process.env.SHELL || '/bin/zsh',
			['-ilc', `echo ${mark}; /usr/bin/env -0`],
			{ encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }
		);
		const pairs = out
			.slice(out.indexOf(mark) + mark.length + 1)
			.split('\0')
			.filter((pair) => pair.includes('='))
			.map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]);
		return Object.fromEntries(pairs);
	} catch (error) {
		note(`could not read the shell's environment: ${error}`);
		return {};
	}
}

/** Starts one of our two services as a process of its own, logging what it says. */
function start(/** @type {'forge' | 'daemon'} */ name) {
	const { entry, env } = service[name];
	const child = utilityProcess.fork(join(here, entry), [], {
		serviceName: `Geordi ${name}`,
		stdio: 'pipe',
		env: { ...process.env, ...shellEnv(), ...runtime.env, ...env }
	});
	for (const stream of [child.stdout, child.stderr])
		stream?.on('data', (data) => log.write(`[${name}] ${data}`));
	note(`started the ${name}`);
	return child;
}

// --- The forge -------------------------------------------------------------------------------

let quitting = false;

function startForge() {
	const forge = start('forge');
	forge.on('exit', (code) => {
		if (quitting) return;
		dialog.showErrorBox(
			'Geordi stopped unexpectedly',
			`The forge exited with code ${code}. Is another Geordi using port ${WEB_PORT}?\n\nSee ${logFile}`
		);
		app.quit();
	});
	return forge;
}

// --- The daemon ------------------------------------------------------------------------------

/** @type {Electron.UtilityProcess | null} */
let daemon = null;

function startDaemon() {
	if (daemon) return;
	const child = start('daemon');
	daemon = child;
	child.on('exit', (code) => {
		note(`the daemon exited with code ${code}`);
		if (daemon !== child) return; // stopped on purpose
		daemon = null;
		menu();
		// it fell over: its agents are still working, and want following again
		if (!quitting) setTimeout(startDaemon, 1000);
	});
	menu();
}

/** Lets go of the daemon. With `agents`, they stop too; otherwise they work on (ADR-007). */
function stopDaemon({ agents = false } = {}) {
	const child = daemon;
	if (!child) return Promise.resolve();
	daemon = null;
	menu();
	const gone = new Promise((resolve) => child.once('exit', resolve));
	if (agents && child.pid) process.kill(child.pid, 'SIGINT');
	else child.kill();
	return gone;
}

// --- Window and menu -------------------------------------------------------------------------

/** Where the window was when it was last closed, whether it filled the screen, and what it showed. */
const placeFile = join(app.getPath('userData'), 'window.json');

/** The window's last place, if it is still on a screen that is there. */
function lastPlace() {
	try {
		const { x, y, width, height, fullscreen } = JSON.parse(readFileSync(placeFile, 'utf8'));
		if (![x, y, width, height].every(Number.isFinite)) return {};
		// a screen that has since been unplugged would leave the window out of reach
		const visible = screen.getAllDisplays().some(({ workArea: area }) => {
			const across = Math.min(x + width, area.x + area.width) - Math.max(x, area.x);
			const down = Math.min(y + height, area.y + area.height) - Math.max(y, area.y);
			return across >= 100 && down >= 100;
		});
		return visible ? { x, y, width, height, fullscreen: fullscreen === true } : {};
	} catch {
		return {}; // never placed before
	}
}

/** The page the window showed when it was last closed (a path of the forge's), if any. */
function lastPage() {
	try {
		const { page } = JSON.parse(readFileSync(placeFile, 'utf8'));
		return typeof page === 'string' && page.startsWith('/') && !page.startsWith('//') ? page : '/';
	} catch {
		return '/';
	}
}

function open() {
	// the first window goes where it was and shows what it did; any further one starts afresh
	const first = BrowserWindow.getAllWindows().length === 0;
	const place = first ? lastPlace() : {};
	const window = new BrowserWindow({
		width: 1440,
		height: 900,
		...place,
		minWidth: 840, // the sidebar, a conversation and the changes beside it, each at its least
		minHeight: 480,
		title: runtime.directory ? 'Geordi Dev' : 'Geordi',
		// No title bar: the window's buttons sit in the sidebar's top row, which the web app
		// makes room for (and makes draggable) where `data-desktop` is set; see `app.html`.
		titleBarStyle: 'hiddenInset',
		trafficLightPosition: { x: 14, y: 21 },
		backgroundColor: '#2c2f3b',
		webPreferences: { preload: join(import.meta.dirname, 'preload.cjs') }
	});
	window.on('close', () => {
		try {
			const shown = URL.parse(window.webContents.getURL());
			const place = {
				...window.getNormalBounds(),
				fullscreen: window.isFullScreen(),
				page: shown?.origin === url ? shown.pathname + shown.search : '/'
			};
			writeFileSync(placeFile, JSON.stringify(place));
		} catch (error) {
			note(`could not remember the window's place: ${error}`);
		}
	});
	const { webContents } = window;
	// Geordi's own pages get a window; everything else belongs in the browser.
	webContents.setWindowOpenHandler(({ url: target }) => {
		if (target.startsWith(`${url}/`)) return { action: 'allow' };
		if (/^https?:/.test(target)) shell.openExternal(target);
		return { action: 'deny' };
	});
	webContents.on('will-navigate', (event, target) => {
		if (target === url || target.startsWith(`${url}/`)) return;
		event.preventDefault();
		if (/^https?:/.test(target)) shell.openExternal(target);
	});
	webContents.on('context-menu', (_event, params) => contextMenu(window, params));
	window.loadURL(first ? url + lastPage() : url);
}

/**
 * What a browser's right-click menu offers, which Electron leaves out: for a picture, text
 * that is selected, and a field. Where the page shows a menu of its own, there is no event.
 */
function contextMenu(window, { mediaType, srcURL, selectionText, isEditable, editFlags, x, y }) {
	const picture = mediaType === 'image' && srcURL;
	const items = [
		...(picture
			? [
					{ label: 'Copy Image', click: () => window.webContents.copyImageAt(x, y) },
					{ label: 'Save Image As…', click: () => window.webContents.downloadURL(srcURL) }
				]
			: []),
		...(isEditable
			? [
					{ role: 'cut', enabled: editFlags.canCut },
					{ role: 'copy', enabled: editFlags.canCopy },
					{ role: 'paste', enabled: editFlags.canPaste },
					{ type: 'separator' },
					{ role: 'selectAll' }
				]
			: selectionText.trim()
				? [{ role: 'copy' }]
				: [])
	];
	if (picture && items.length > 2) items.splice(2, 0, { type: 'separator' });
	if (items.length) Menu.buildFromTemplate(items).popup({ window });
}

let updates;

function menu() {
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			{
				role: 'appMenu',
				submenu: [
					{ role: 'about' },
					{ type: 'separator' },
					{
						label: 'Settings…',
						accelerator: 'CommandOrControl+,',
						// the web app's own shortcut may have opened them already: asking is harmless
						click: (_item, window) =>
							window?.webContents.executeJavaScript(
								"document.dispatchEvent(new Event('geordi:settings'))"
							)
					},
					{ type: 'separator' },
					{ role: 'services' },
					{ type: 'separator' },
					{ role: 'hide' },
					{ role: 'hideOthers' },
					{ role: 'unhide' },
					{ type: 'separator' },
					{ role: 'quit' }
				]
			},
			{ role: 'fileMenu' },
			{ role: 'editMenu' },
			{ role: 'viewMenu' },
			{
				label: 'Daemon',
				submenu: [
					{ label: 'Start Daemon', enabled: !daemon, click: startDaemon },
					{
						label: 'Restart Daemon',
						enabled: !!daemon,
						click: () => stopDaemon().then(startDaemon)
					},
					{
						label: 'Stop Daemon and Its Agents',
						enabled: !!daemon,
						click: () => stopDaemon({ agents: true })
					},
					{ type: 'separator' },
					{ label: 'Show Log', click: () => shell.showItemInFolder(logFile) }
				]
			},
			{ role: 'windowMenu' }
		])
	);
}

// --- Life cycle ------------------------------------------------------------------------------

// One Geordi at a time: two daemons would follow the same turns.
if (!app.requestSingleInstanceLock()) app.quit();
else {
	app.on('second-instance', () => {
		const [window] = BrowserWindow.getAllWindows();
		if (!window) return open();
		if (window.isMinimized()) window.restore();
		window.focus();
	});

	// Closing the window is not quitting: the agents work on, and the Dock icon brings it back.
	app.on('window-all-closed', () => {});
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) open();
	});
	app.on('before-quit', () => (quitting = true));

	// How many workspaces are unread, as the web app counts them: a number on the app's icon.
	ipcMain.on('geordi:badge', (_event, count) =>
		app.setBadgeCount(Number.isInteger(count) && count > 0 ? count : 0)
	);

	// The web app's notifications, as the app's own. Their sound is a file in the app that
	// the system plays with them: the app plays no sound itself, which on macOS would have
	// the system ask whether it may use the microphone.
	const notified = new Map();
	ipcMain.on('geordi:notify', (event, { id, title, body, failed } = {}) => {
		if (typeof id !== 'string' || !Notification.isSupported()) return;
		notified.get(id)?.close();
		const notification = new Notification({
			title: String(title).slice(0, 200),
			body: String(body).slice(0, 300),
			sound: failed ? 'geordi-failed.wav' : 'geordi-done.wav'
		});
		notification.on('click', () => {
			const window = BrowserWindow.fromWebContents(event.sender);
			if (!window) return;
			if (window.isMinimized()) window.restore();
			window.show();
			window.focus();
			event.sender.send('geordi:open', id);
		});
		notification.on('close', () => notified.get(id) === notification && notified.delete(id));
		notified.set(id, notification);
		notification.show();
	});
	ipcMain.on('geordi:dismiss', (_event, id) => {
		notified.get(id)?.close();
		notified.delete(id);
	});

	ipcMain.on('geordi:updates', (event, action, value) => {
		const frame = event.senderFrame;
		if (!frame || frame !== event.sender.mainFrame || URL.parse(frame.url)?.origin !== url) return;
		switch (action) {
			case 'read':
				event.reply('geordi:update-state', updates?.state() ?? null);
				break;
			case 'beta':
				updates?.setBeta(value);
				break;
			case 'check':
				void updates?.check();
				break;
			case 'restart':
				updates?.restart();
				break;
		}
	});

	app.whenReady().then(async () => {
		menu();
		startForge();
		await forgeReady(WEB_PORT);
		startDaemon();
		open();
		// Only the signed release workflow adds the update feed before signing.
		if (
			process.platform === 'darwin' &&
			app.isPackaged &&
			!runtime.directory &&
			existsSync(join(process.resourcesPath, 'app-update.yml'))
		) {
			const { default: updater } = await import('./release-updater.cjs');
			const file = join(app.getPath('userData'), 'update-channel');
			updates = desktopUpdates({
				updater,
				preferences: {
					read: () => (existsSync(file) ? readFileSync(file, 'utf8') : 'latest'),
					write: (channel) => writeFileSync(file, channel)
				},
				refresh() {
					for (const window of BrowserWindow.getAllWindows()) {
						window.webContents.send('geordi:update-state', updates.state());
					}
				},
				note
			});
			void updates.check();
			setInterval(updates.check, 60 * 60 * 1000).unref();
		}
	});
}
