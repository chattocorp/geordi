import { SvelteSet } from 'svelte/reactivity';
import { cameToRest, type TurnEnd, type Watched } from './attention.ts';

/**
 * Telling the person when a workspace needs them (FDR-008): a system notification and a
 * short, quiet sound when its agents come to rest out of their sight, and the workspace in
 * bold in the sidebar until they have looked. All of it belongs to this browser: whether it
 * is on (`geordi:notify`), and what is unread (`geordi:unread`), both in localStorage.
 */

const browser = typeof window !== 'undefined';

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

/** What the browser lets us do; `unsupported` where there are no notifications (not https). */
let permission = $state<NotificationPermission | 'unsupported'>(
	browser && 'Notification' in window ? Notification.permission : 'unsupported'
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

function show(workspace: Listed, open: (id: string) => void) {
	if (permission !== 'granted') return;
	shown.get(workspace.id)?.close();
	const failed = workspace.outcome === 'failed';
	const notification = new Notification(workspace.title, {
		body: failed ? 'The agent ran into a problem.' : 'The agent is done.',
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

let audio: AudioContext | null = null;

/**
 * Two soft notes, made on the spot rather than loaded: rising when done, falling when
 * something went wrong. Quiet enough to be heard, not startled by.
 */
function chime(failed: boolean) {
	try {
		audio ??= new AudioContext();
		void audio.resume();
		const notes = failed ? [659.25, 493.88] : [659.25, 880];
		notes.forEach((frequency, index) => {
			const at = audio!.currentTime + index * 0.13;
			const tone = audio!.createOscillator();
			const gain = audio!.createGain();
			tone.type = 'sine';
			tone.frequency.value = frequency;
			gain.gain.setValueAtTime(0, at);
			gain.gain.linearRampToValueAtTime(0.06, at + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
			tone.connect(gain).connect(audio!.destination);
			tone.start(at);
			tone.stop(at + 0.5);
		});
	} catch {
		// no sound to be had here: the notification has to do
	}
}
