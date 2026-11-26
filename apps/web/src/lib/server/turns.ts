import type { TurnBlobs, TurnDiff } from '@geordi/protocol';
import type { TranscriptItem } from './workspace-projection.ts';

type Asked = Extract<TranscriptItem, { kind: 'question' }>;

/**
 * One exchange of a conversation, as `read_workspace` gives it: what the agent was told
 * (`message`, null in a turn it began itself) and what it answered in the end (`reply`, its
 * last words; what it said on the way there is left out, like its tool calls).
 */
export type Turn = {
	at: string;
	message: string | null;
	/** The workspace whose agent said `message`, where it was not a person. */
	from?: string;
	senderName?: string;
	images?: string[];
	reply: string;
	error: string | null;
	questions?: Asked[];
};

/** At most this many turns on a page… */
export const PAGE_TURNS = 50;
/** …and about this many characters (some 10k tokens), so that a page fits in a tool result. */
export const PAGE_CHARS = 40_000;
/** A message or reply longer than this is cut: a message keeps its start, a reply its end. */
export const MAX_TEXT = 16_000;

/** A transcript as turns: each person's or agent's message begins one, and so does an agent's own. */
export function turnsOf(transcript: TranscriptItem[]): Turn[] {
	const turns: Turn[] = [];
	let current: Turn | null = null;
	for (const item of transcript) {
		if (item.kind === 'user') {
			const { text, at, from, senderName, images } = item;
			current = {
				at,
				message: text,
				...(from && { from }),
				...(senderName && { senderName }),
				...(images?.length && { images }),
				reply: '',
				error: null
			};
			turns.push(current);
		} else if (item.kind === 'turn') current = null;
		else if (item.kind === 'text' || item.kind === 'error' || item.kind === 'question') {
			if (!current) turns.push((current = { at: item.at, message: null, reply: '', error: null }));
			if (item.kind === 'text') current.reply = item.text;
			else if (item.kind === 'error') current.error = item.error;
			else (current.questions ??= []).push(item);
		}
	}
	return turns;
}

function clip(turn: Turn): Turn {
	const { message, reply } = turn;
	return {
		...turn,
		message:
			message && message.length > MAX_TEXT
				? `${message.slice(0, MAX_TEXT)}… (${message.length - MAX_TEXT} more characters)`
				: message,
		reply:
			reply.length > MAX_TEXT
				? `(${reply.length - MAX_TEXT} earlier characters left out) …${reply.slice(-MAX_TEXT)}`
				: reply
	};
}

/**
 * The page of turns that ends before `before` (the newest, without it): as many as fit in
 * `PAGE_TURNS` and `PAGE_CHARS`, but always one. `before` is where the previous page ends,
 * null on the first.
 */
export function pageOf(turns: Turn[], before = turns.length) {
	const end = Math.min(before, turns.length);
	const page: Turn[] = [];
	let size = 0;
	for (let i = end - 1; i >= 0 && page.length < PAGE_TURNS; i--) {
		const turn = clip(turns[i]);
		size += JSON.stringify(turn).length;
		if (page.length && size > PAGE_CHARS) break;
		page.unshift(turn);
	}
	const start = end - page.length;
	return { turns: page, before: start || null };
}

/** Resolve each file in a saved review once. Older patches carry the IDs in their index lines. */
export async function turnBlobIndex(diff: TurnDiff) {
	const files = new Map<string, TurnBlobs>();
	const legacy = new Set<string>();
	for (const file of diff.files) {
		if (file.fileType === 'binary') continue;
		if (file.blobs) files.set(file.path, file.blobs);
		else legacy.add(file.path);
	}
	if (!legacy.size || !diff.patch || diff.fullContext) return files;
	const { parsePatchFiles } = await import('@pierre/diffs');
	for (const patch of parsePatchFiles(diff.patch).flatMap((p) => p.files)) {
		if (!legacy.delete(patch.name) || !patch.prevObjectId || !patch.newObjectId) continue;
		files.set(patch.name, {
			old: /^0+$/.test(patch.prevObjectId) ? null : patch.prevObjectId,
			new: /^0+$/.test(patch.newObjectId) ? null : patch.newObjectId
		});
	}
	return files;
}
