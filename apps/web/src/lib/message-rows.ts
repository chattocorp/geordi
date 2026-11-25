import { childReport, type Block } from './transcript.ts';

import type { SenderDetails } from './server/workspace-projection.ts';

type QueuedMessage = { text: string; index: number; images: string[] };
type ChildMessage = {
	senderDetails?: SenderDetails;
	text: string;
	images?: string[];
	report?: 'finished' | 'stopped';
	queued?: QueuedMessage;
};

export type ChildExchange = {
	kind: 'child';
	key: string;
	from: string;
	name: string;
	messages: ChildMessage[];
};

type Row =
	| { kind: 'block'; block: Block; index: number }
	| ({ kind: 'queue' } & QueuedMessage)
	| ChildExchange;

/** Fold only adjacent messages from the same workspace; every other row ends the exchange. */
export function messageRows(
	blocks: Block[],
	childSenders: Record<string, string>,
	queue: string[],
	queueSenders: (string | null)[],
	queueImages: string[][],
	queueDetails: (SenderDetails | null)[] = []
) {
	const rows: Row[] = [];
	function addChild(from: string, name: string, key: string, message: ChildMessage) {
		const last = rows.at(-1);
		if (last?.kind === 'child' && last.from === from) {
			last.name = name;
			last.messages.push(message);
		} else rows.push({ kind: 'child', key, from, name, messages: [message] });
	}
	for (const [index, block] of blocks.entries()) {
		if (block.kind === 'user' && block.from && (block.report || childSenders[block.from]))
			addChild(
				block.from,
				block.senderName || childSenders[block.from] || 'Child agent',
				String(index),
				block
			);
		else rows.push({ kind: 'block', block, index });
	}
	for (const [index, text] of queue.entries()) {
		const from = queueSenders[index];
		const report = childReport({ from, text });
		const queued = { text, index, images: queueImages[index] ?? [] };
		if (from && (report || childSenders[from]))
			addChild(
				from,
				report?.senderName || childSenders[from],
				JSON.stringify(['queue', index, from, text]),
				{
					text: report?.text ?? text,
					images: queued.images,
					report: report?.report,
					...(queueDetails[index] && { senderDetails: queueDetails[index] }),
					queued
				}
			);
		else rows.push({ kind: 'queue', ...queued });
	}
	return rows;
}
