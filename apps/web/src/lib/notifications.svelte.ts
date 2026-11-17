import { SvelteSet } from 'svelte/reactivity';
import { cameToRest, type TurnEnd, type Watched } from './attention.ts';
import { chimeWav } from './chime.ts';

/**
 * Telling the person when a workspace needs them (FDR-008): a system notification and a
 * short, quiet sound when its agents come to rest out of their sight, and the workspace in
 * bold in the sidebar until they have looked, counted on the app's icon (the Dock, in the
 * desktop app). All of it belongs to this browser: whether it is on (`geordi:notify`), and
 * what is unread (`geordi:unread`, shared by its tabs and windows), both in localStorage.
 */

const browser = typeof window !== 'undefined';

/**
 * What the desktop app does for its page (see its `preload.cjs`). There, notifications are
 * the app's own, shown by the system with a sound of ours that the system plays. The app
 * never plays sound itself: on macOS that has the system check, and ask, whether the app
 * may use the microphone, wherever sound goes out through a device that also takes it in.
 */
type Desktop = {
	badge(count: number): void;
	notify(notification: { id: string; title: string; body: string; failed: boolean }): void;
	dismiss(id: string): void;
	/** Calls back with the ID of a notification that was clicked. */
	onOpen(opened: (id: string) => void): void;
};
const desktop = browser ? (window as { geordiDesktop?: Desktop }).geordiDesktop : undefined;

function load(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null; // storage unavailable (private mode)
	}
}

function save(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// storage unavailable: it lasts for this page only
	}
}

let on = $state(browser ? load('geordi:notify') !== 'off' : true);

/** Workspaces the person was told about and hasn't looked at since. */
export const unread = new SvelteSet<string>(browser ? stored() : []);

function stored(): string[] {
	try {
		const ids: unknown = JSON.parse(load('geordi:unread') ?? '[]');
		return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
	} catch {
		return []; // corrupt: start afresh
	}
}
const saveUnread = () => save('geordi:unread', unread.size ? JSON.stringify([...unread]) : null);

// another tab or window read or was told something: so has this one
if (browser)
	window.addEventListener('storage', ({ key }) => {
		if (key !== 'geordi:unread' && key !== null) return;
		const now = stored();
		for (const id of unread) if (!now.includes(id)) unread.delete(id);
		for (const id of now) unread.add(id);
	});

/**
 * Shows how many workspaces are unread on the app's icon: the Dock in the desktop app, an
 * installed web app's icon elsewhere. Browsers without it show nothing. Call in an effect.
 */
export function badge() {
	const count = unread.size;
	if (!browser) return;
	// the desktop app counts on its icon itself: what the browser's own way shows there is a dot
	if (desktop) return desktop.badge(count);
	if (!('setAppBadge' in navigator)) return;
	void (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {
		// not allowed here (not installed, or no permission): the sidebar still says
	});
}

/** What the browser lets us do; `unsupported` where there are no notifications (not https). */
let permission = $state<NotificationPermission | 'unsupported'>(
	// the desktop app's notifications are the system's to allow, not the page's
	desktop
		? 'granted'
		: browser && 'Notification' in window
			? Notification.permission
			: 'unsupported'
);

export const notifications = {
	/** Whether to tell at all; on unless turned off in the settings. */
	get on() {
		return on;
	},
	set on(next: boolean) {
		on = next;
		save('geordi:notify', next ? null : 'off');
		if (next) ask();
		// off means nothing to tell of, also of what was told before
		else for (const id of [...unread]) seen(id);
	},
	get permission() {
		return permission;
	}
};

/**
 * Asks the browser for leave to notify, once, where it hasn't been asked. Call it on
 * something the person did (most browsers only ask then): sending an agent off to work is
 * when being told it is done starts to matter.
 */
export async function ask() {
	if (!on || permission !== 'default') return;
	permission = await Notification.requestPermission();
}

/** Whether the person is looking at this page: shown, and the window in front. */
let looking = $state(false);
if (browser) {
	const update = () => (looking = document.visibilityState === 'visible' && document.hasFocus());
	update();
	for (const event of ['focus', 'blur']) window.addEventListener(event, update);
	document.addEventListener('visibilitychange', update);
}

/** The notification of each workspace, so that looking at it can take it away. */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never shown
const shown = new Map<string, Notification>();

/** The person has seen the workspace: it is read, and its notification is old news. */
export function seen(id: string) {
	desktop?.dismiss(id);
	shown.get(id)?.close();
	shown.delete(id);
	if (unread.delete(id)) saveUnread();
}

/** Whether the person is looking at this page at all. */
export const isLooking = () => looking;

type Listed = Watched & { title: string };

/** How each workspace was last seen, to tell when one comes to rest. */
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never shown
const before = new Map<string, TurnEnd | null>();

/**
 * Follows the sidebar's workspaces and tells of those that came to rest, unless the person
 * is looking at that one. `viewed` is the workspace on screen, if any; `open` takes them to
 * one, for a click on its notification.
 */
export function watch(all: Listed[], viewed: string | null, open: (id: string) => void) {
	const rested = cameToRest(before, all);
	before.clear();
	for (const workspace of all) before.set(workspace.id, workspace.outcome);
	for (const id of unread) if (!before.has(id)) seen(id); // archived
	if (!on) return;

	const told = rested.filter((workspace) => !(looking && workspace.id === viewed));
	for (const workspace of told) {
		unread.add(workspace.id);
		show(workspace, open);
	}
	if (told.length) {
		saveUnread();
		chime(told.some((workspace) => workspace.outcome === 'failed'));
	}
}

/** Where a click on one of the desktop app's notifications leads: said by `watch`. */
let opens: (id: string) => void = () => {};
desktop?.onOpen((id) => {
	if (id !== TEST) opens(id);
});
const TEST = 'geordi:test';

function show(workspace: Listed, open: (id: string) => void) {
	if (permission !== 'granted') return;
	const failed = workspace.outcome === 'failed';
	const title = failed ? 'Agent ran into a problem' : 'Agent finished';
	const body = workspace.title;
	if (desktop) {
		opens = open;
		return desktop.notify({ id: workspace.id, title, body, failed });
	}
	shown.get(workspace.id)?.close();
	const notification = new Notification(title, {
		body,
		tag: workspace.id, // one per workspace, also across tabs
		silent: true // the sound is our own
	});
	notification.onclick = () => {
		window.focus();
		open(workspace.id);
		notification.close();
	};
	notification.onclose = () =>
		shown.get(workspace.id) === notification && shown.delete(workspace.id);
	shown.set(workspace.id, notification);
}

/**
 * Shows a notification and plays the sound, as when an agent is done: to see and hear what
 * they are like, and whether they get through. Asks for leave first where that is still
 * open. Says what came of it: the system may still keep a notification to itself (its own
 * settings, a focus mode), which nothing here can tell.
 */
export async function test(): Promise<'sent' | 'blocked' | 'unsupported'> {
	const title = 'Agent finished';
	const body = 'This is what it looks like when an agent is done.';
	if (desktop) {
		desktop.notify({ id: TEST, title, body, failed: false });
		return 'sent';
	}
	chime(false);
	if (permission === 'unsupported') return 'unsupported';
	if (permission === 'default') permission = await Notification.requestPermission();
	if (permission !== 'granted') return 'blocked';
	const notification = new Notification(title, { body, tag: TEST, silent: true });
	notification.onclick = () => {
		window.focus();
		notification.close();
	};
	return 'sent';
}

/**
 * Two soft notes, made on the spot rather than loaded: rising when done, falling when
 * something went wrong. Quiet enough to be heard, not startled by. In a browser only: in
 * the desktop app the system plays them, with the notification (see `desktop`).
 */
function chime(failed: boolean) {
	if (desktop) return;
	try {
		const wav = chimeWav(failed);
		const url = URL.createObjectURL(new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }));
		const audio = new Audio(url);
		audio.onended = audio.onerror = () => URL.revokeObjectURL(url);
		void audio.play().catch(() => URL.revokeObjectURL(url));
	} catch {
		// no sound to be had here: the notification has to do
	}
}
