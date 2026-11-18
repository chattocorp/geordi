// What the web app can ask of the app around it, and nothing more: it runs in the page's
// world, sandboxed, and passes on plain values.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a sandboxed preload script can only be CommonJS
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('geordiDesktop', {
	/** How many workspaces are unread: shown as a number on the app's icon. */
	badge: (count) => ipcRenderer.send('geordi:badge', count),
	/** Shows a notification of the app's own, with its sound: the system plays that. */
	notify: (notification) => ipcRenderer.send('geordi:notify', notification),
	/** Takes a notification back: what it told of has been seen. */
	dismiss: (id) => ipcRenderer.send('geordi:dismiss', id),
	/** Calls back with the ID of a notification that was clicked. */
	onOpen: (opened) => ipcRenderer.on('geordi:open', (_event, id) => opened(id)),
	updates: {
		subscribe(callback) {
			const receive = (_event, state) => callback(state);
			ipcRenderer.on('geordi:update-state', receive);
			ipcRenderer.send('geordi:updates', 'read');
			return () => ipcRenderer.removeListener('geordi:update-state', receive);
		},
		setBeta: (value) => ipcRenderer.send('geordi:updates', 'beta', value),
		check: () => ipcRenderer.send('geordi:updates', 'check'),
		restart: () => ipcRenderer.send('geordi:updates', 'restart')
	}
});
