import type { TranscriptItem } from '#lib/server/workspaces.ts';

type Tool = Extract<TranscriptItem, { kind: 'tool' }>;

export type Part =
	| { kind: 'text'; text: string }
	| { kind: 'tools'; tools: Tool[] }
	| { kind: 'error'; error: string };

/** A user message, everything the agent did in reply to one, or something said in passing. */
export type Block =
	| { kind: 'user'; text: string }
	| { kind: 'agent'; parts: Part[] }
	| { kind: 'note'; text: string };

/** Groups a flat transcript into turns, merging consecutive tool calls into one part. */
export function toBlocks(transcript: TranscriptItem[]): Block[] {
	const blocks: Block[] = [];

	for (const item of transcript) {
		if (item.kind === 'user' || item.kind === 'note') {
			blocks.push({ kind: item.kind, text: item.text });
			continue;
		}

		let agent = blocks.at(-1);
		if (agent?.kind !== 'agent') blocks.push((agent = { kind: 'agent', parts: [] }));

		const last = agent.parts.at(-1);
		if (item.kind === 'tool') {
			if (last?.kind === 'tools') last.tools.push(item);
			else agent.parts.push({ kind: 'tools', tools: [item] });
		} else if (item.kind === 'text') {
			agent.parts.push({ kind: 'text', text: item.text });
		} else {
			agent.parts.push({ kind: 'error', error: item.error });
		}
	}

	return blocks;
}
