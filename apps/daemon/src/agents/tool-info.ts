import type { ToolCallUpdate } from '@agentclientprotocol/sdk/experimental/v2/unstable';
import { TOOL_KINDS, type ToolInfo, type ToolKind } from '@geordi/protocol';
import { truncate } from './adapter.ts';

const isKind = (kind: string): kind is ToolKind => (TOOL_KINDS as readonly string[]).includes(kind);

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
		if (u.rawInput !== undefined) said.pending = truncate(JSON.stringify(u.rawInput) ?? '');
		const heard: ToolInfo = {
			...(u.title && { title: u.title }),
			...(u.kind && { toolKind: isKind(u.kind) ? u.kind : 'other' }),
			...(u.locations && {
				locations: u.locations.map(({ path, line }) => ({ path, ...(line && { line }) }))
			})
		};
		const news: Said = {};
		for (const [key, value] of Object.entries(heard)) {
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
