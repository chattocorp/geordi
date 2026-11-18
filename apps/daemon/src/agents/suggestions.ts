import type { SessionUpdate } from '@agentclientprotocol/sdk/experimental/v2/unstable';

/**
 * What the agent suggests the person say next, from one session update: the first
 * suggestion's text, `null` when the agent withdraws what it suggested, `undefined` when the
 * update says nothing of it.
 *
 * The pinned wrappers both send it as `session_info_update._meta.promptSuggestions`, and
 * only to a client that declares JetBrains AIR's `_meta` (see `initialize` in `acp.ts`).
 * ACP's own `prompt_suggestions_update` (unstable) is read as well, for when they move to it.
 */
export function promptSuggestion(u: SessionUpdate): string | null | undefined {
	const list =
		u.sessionUpdate === 'prompt_suggestions_update'
			? u.suggestions
			: u.sessionUpdate === 'session_info_update'
				? (u._meta as { promptSuggestions?: { suggestions?: unknown } } | undefined)
						?.promptSuggestions?.suggestions
				: undefined;
	if (!Array.isArray(list)) return undefined;
	for (const item of list as { text?: unknown; prompt?: unknown }[]) {
		const text =
			typeof item?.text === 'string'
				? item.text
				: Array.isArray(item?.prompt)
					? (item.prompt as { type?: unknown; text?: unknown }[])
							.flatMap((c) => (c?.type === 'text' && typeof c.text === 'string' ? [c.text] : []))
							.join('')
					: '';
		if (text.trim()) return text.trim();
	}
	return null;
}
