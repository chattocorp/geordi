import type { TurnDiff, TurnUsage } from '@geordi/protocol';
import type { SubagentItem, TranscriptItem } from '#lib/server/workspaces.ts';

import { isBrowserCompletion } from './agent-directives.ts';
import { tokens } from './tokens.ts';

export type TurnChanges = { number: number; diff: TurnDiff };

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
	| (Pick<
			Extract<TranscriptItem, { kind: 'user' }>,
			'kind' | 'text' | 'from' | 'images' | 'senderName'
	  > & {
			delegated?: boolean;
			report?: 'finished' | 'stopped';
	  })
	/**
	 * Of the turns of this reply, together: what they `used`, where their agent said, and how
	 * long they `took` (ms), where they said when they began.
	 */
	| {
			kind: 'agent';
			parts: Part[];
			changes?: TurnChanges;
			usage?: TurnUsage;
			took?: number;
			endedAt?: string;
	  }
	/** `working`: what it says is still going on. */
	| { kind: 'note'; text: string; working?: boolean };

/** What a compaction says in passing. */
export function compactionNote(item: Extract<TranscriptItem, { kind: 'compaction' }>) {
	const { status, tokensBefore: before, tokensAfter: after } = item;
	if (status === 'running') return 'Compacting the conversation';
	if (status === 'failed') return 'Could not compact the conversation';
	if (status === 'cancelled') return 'Stopped compacting the conversation';
	const counts =
		before !== undefined && after !== undefined
			? `, ${tokens(before)} → ${tokens(after)} tokens`
			: '';
	return `Compacted the conversation${counts}`;
}

/** Read the envelope stored with a child report, including reports in older conversations. */
export function childReport(item: { text: string; from?: string | null }) {
	if (!item.from || item.from.startsWith('external:')) return;
	const match =
		/^Your agent “(?<name>[^\n]*)” \((?<id>[^)\n]+)\) (?<status>finished its turn\.(?:\n\n|$)|stopped: )/.exec(
			item.text
		);
	const notice = match?.groups;
	if (!match || !notice || notice.id !== item.from) return;
	const report: 'finished' | 'stopped' = notice.status.startsWith('finished')
		? 'finished'
		: 'stopped';
	const text = item.text
		.slice(match[0].length)
		.replace(/^\(Its reply begins earlier; see read_workspace\.\)\n\n(?=…)/, '');
	return { report, senderName: notice.name, text };
}

/** Groups a flat transcript into turns, merging consecutive tool calls into one part. */
export function toBlocks(transcript: TranscriptItem[] | SubagentItem['items']): Block[] {
	const blocks: Block[] = [];
	let turnNumber = 0;

	for (const item of transcript) {
		if (item.kind === 'message') {
			if (!item.text) continue;
			if (item.incoming) {
				blocks.push({ kind: 'user', text: item.text, delegated: true });
				continue;
			}
		}
		if ((item.kind === 'text' || item.kind === 'message') && isBrowserCompletion(item.text))
			continue;
		if (item.kind === 'note') {
			blocks.push({ kind: 'note', text: item.text });
			continue;
		}
		if (item.kind === 'compaction') {
			const working = item.status === 'running';
			blocks.push({ kind: 'note', text: compactionNote(item), ...(working && { working }) });
			continue;
		}
		if (item.kind === 'user') {
			blocks.push({
				kind: 'user',
				text: item.text,
				...childReport(item),
				...(item.images?.length && { images: item.images }),
				...(item.from && { from: item.from }),
				...(item.senderName && { senderName: item.senderName })
			});
			continue;
		}

		if (item.kind === 'turn') {
			turnNumber++;
			// the reply it ends, before anything said in passing since (a compaction)
			let agent = blocks.findLast((block) => block.kind !== 'note');
			if (item.diff && (agent?.kind !== 'agent' || agent.changes))
				blocks.push((agent = { kind: 'agent', parts: [] }));
			if (agent?.kind !== 'agent') continue;
			agent.endedAt = item.at;
			if (item.diff) agent.changes = { number: turnNumber, diff: item.diff };
			if (item.usage) agent.usage = addUsage(agent.usage, item.usage);
			if (item.startedAt)
				agent.took = (agent.took ?? 0) + Date.parse(item.at) - Date.parse(item.startedAt);
			continue;
		}

		let agent = blocks.at(-1);
		if (agent?.kind !== 'agent' || agent.changes)
			blocks.push((agent = { kind: 'agent', parts: [] }));

		const last = agent.parts.at(-1);
		if (item.kind === 'tool') {
			if (last?.kind === 'tools') last.tools.push(item);
			else agent.parts.push({ kind: 'tools', tools: [item] });
		} else if (item.kind === 'text' || item.kind === 'message') {
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

/** Two turns' usage together: a reply can span turns the agent began by itself. */
function addUsage(a: TurnUsage | undefined, b: TurnUsage): TurnUsage {
	if (!a) return b;
	const sum: TurnUsage = { ...a };
	for (const key of Object.keys(b) as (keyof TurnUsage)[]) sum[key] = (a[key] ?? 0) + (b[key] ?? 0);
	return sum;
}

export function subagentBlocks(child: SubagentItem): Block[] {
	const blocks = toBlocks(child.items);
	const notices = {
		failed: 'Subagent failed',
		stopped: 'Subagent stopped',
		waiting: 'Waiting for input'
	};
	if (child.state === 'failed' || child.state === 'stopped' || child.state === 'waiting')
		blocks.push({ kind: 'note', text: notices[child.state] });
	else if (!blocks.length)
		blocks.push({ kind: 'note', text: child.description || 'No activity reported yet.' });
	return blocks;
}
