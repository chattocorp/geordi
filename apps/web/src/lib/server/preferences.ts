import type { EventStore, GeordiEvent } from './events/index.ts';

/** What a person chose for the whole installation, in Settings (FDR-005). */
export type Preferences = {
	/**
	 * Whether Claude Code is told that Geordi started it (`CLAUDE_CODE_ENTRYPOINT`), instead of
	 * the Agent SDK's own `sdk-ts`. Experimental: Anthropic does not document the variable.
	 */
	identifyClaude: boolean;
};

export type PreferenceEvent = {
	type: 'preferences.changed';
	stream: 'preferences';
	data: Partial<Preferences>;
};

const DEFAULTS: Preferences = { identifyClaude: false };

export function createPreferences(store: EventStore<GeordiEvent>) {
	const preferences = store.project(
		'preferences',
		() => ({ ...DEFAULTS }),
		(all, event) => (event.type === 'preferences.changed' ? { ...all, ...event.data } : all),
		['preferences']
	);
	return {
		get: (): Preferences => preferences.get(),
		set(change: Partial<Preferences>) {
			store.append({ type: 'preferences.changed', stream: 'preferences', data: change });
		}
	};
}
