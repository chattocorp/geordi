import { expect, it } from 'vitest';
import type { SessionUpdate } from '@agentclientprotocol/sdk/experimental/v2/unstable';
import { promptSuggestion } from './suggestions.ts';

const info = (meta: unknown) =>
	({ sessionUpdate: 'session_info_update', _meta: meta }) as SessionUpdate;

it('reads the suggestion both wrappers send in session info, as observed', () => {
	const sent = { promptSuggestions: { suggestions: [{ text: ' Read notes.txt again. ' }] } };
	expect(promptSuggestion(info(sent))).toBe('Read notes.txt again.');
	// an empty list withdraws it; a blank one says nothing worth offering
	expect(promptSuggestion(info({ promptSuggestions: { suggestions: [] } }))).toBeNull();
	expect(
		promptSuggestion(info({ promptSuggestions: { suggestions: [{ text: ' ' }] } }))
	).toBeNull();
});

it('ignores updates that say nothing of suggestions', () => {
	expect(promptSuggestion(info(undefined))).toBeUndefined();
	expect(promptSuggestion(info({ other: 1 }))).toBeUndefined();
	expect(
		promptSuggestion({ sessionUpdate: 'session_info_update', title: 'A title' } as SessionUpdate)
	).toBeUndefined();
});

it("reads ACP's own prompt suggestions update", () => {
	const update = {
		sessionUpdate: 'prompt_suggestions_update',
		suggestions: [{ prompt: [{ type: 'text', text: 'Run the tests' }] }]
	} as SessionUpdate;
	expect(promptSuggestion(update)).toBe('Run the tests');
});
