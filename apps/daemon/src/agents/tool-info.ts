import type { ToolCallUpdate } from '@agentclientprotocol/sdk/experimental/v2/unstable';
import type { ToolInfo, ToolKind } from '@geordi/protocol';
import { truncate } from './adapter.ts';

const KINDS = new Set<string>([
	'read',
	'edit',
	'delete',
	'move',
	'search',
	'execute',
	'think',
	'fetch',
	'switch_mode',
	'other'
]);

type Said = ToolInfo & { input?: string };

/**
 * What the updates of one tool call say about it, field by field. ACP updates a call in
 * place, each update carrying what changed (and wrappers repeat some fields anyway): we
 * keep what was said last, so that only news reaches the event log. Claude streams a
 * tool's input as the model writes it; a change to the input alone waits for other news,
 * or for the call to end (`last`), so that the log keeps one or two versions of it.
 */
export class ToolInfos {
	#said = new Map<string, Record<string, string>>();

	/** Whether this tool call was heard of before. */
	has(id: string) {
		return this.#said.has(id);
	}

	/** What this update says of its tool call that was not said before. */
	news(u: ToolCallUpdate, last = false): Said {
		const fresh = !this.#said.has(u.toolCallId);
		const said = this.#said.get(u.toolCallId) ?? {};
		this.#said.set(u.toolCallId, said);
		const heard: Said = {};
		if (u.rawInput !== undefined) heard.input = truncate(JSON.stringify(u.rawInput) ?? '');
		if (u.title) heard.title = u.title;
		if (u.kind) heard.toolKind = (KINDS.has(u.kind) ? u.kind : 'other') as ToolKind;
		if (u.locations)
			heard.locations = u.locations.map(({ path, line }) => ({ path, ...(line && { line }) }));
		if (heard.input !== undefined) said.pending = heard.input;
		delete heard.input;
		const news: Said = {};
		for (const [key, value] of Object.entries(heard) as [keyof Said, Said[keyof Said]][]) {
			const text = JSON.stringify(value);
			// No files named is not news, until some were.
			if (said[key] === text || (said[key] === undefined && text === '[]')) continue;
			said[key] = text;
			Object.assign(news, { [key]: value });
		}
		const input = said.pending;
		if (input !== undefined && input !== said.input && (fresh || last || Object.keys(news).length))
			news.input = said.input = input;
		return news;
	}

	delete(id: string) {
		this.#said.delete(id);
	}
}
