import type { TranscriptItem } from '#lib/server/workspaces.ts';

type Tool = Extract<TranscriptItem, { kind: 'tool' }>;

export type Part =
	| Extract<TranscriptItem, { kind: 'subagent' }>
	| { kind: 'text'; text: string }
	| { kind: 'tools'; tools: Tool[] }
	| Omit<Extract<TranscriptItem, { kind: 'question' }>, 'at'>
	| Omit<Extract<TranscriptItem, { kind: 'plan' }>, 'at'>
	| { kind: 'error'; error: string };

/** A user message, everything the agent did in reply to one, or something said in passing. */
export type Block =
	| Pick<Extract<TranscriptItem, { kind: 'user' }>, 'kind' | 'text' | 'from' | 'images'>
	| { kind: 'agent'; parts: Part[] }
	| { kind: 'note'; text: string };

/** Groups a flat transcript into turns, merging consecutive tool calls into one part. */
export function toBlocks(transcript: TranscriptItem[]): Block[] {
	const blocks: Block[] = [];

	for (const item of transcript) {
		if (item.kind === 'note') {
			blocks.push({ kind: 'note', text: item.text });
			continue;
		}
		if (item.kind === 'user') {
			blocks.push({
				kind: 'user',
				text: item.text,
				...(item.images?.length && { images: item.images }),
				...(item.from && { from: item.from })
			});
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
		} else if (item.kind === 'subagent') {
			agent.parts.push(item);
		} else if (item.kind === 'plan') {
			agent.parts.push({ kind: 'plan', id: item.id, plan: item.plan });
		} else if (item.kind === 'question') {
			const { at, ...question } = item;
			void at;
			agent.parts.push(question);
		} else {
			agent.parts.push({ kind: 'error', error: item.error });
		}
	}

	return blocks;
}
