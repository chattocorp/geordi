import type { TranscriptItem } from '#lib/server/workspaces.ts';
import { toolIcon, toolSummary } from './tools.ts';

/**
 * What can be seen of a conversation at a glance, for the overview: what the agent asks,
 * is doing, and said last. Pure, so that it can be tested.
 */
export type Glimpse = {
	/** The open question it waits on the answer to. */
	asks: string | null;
	/** The tool it is running now, in a line. */
	doing: { icon: string; text: string } | null;
	/** The latest thing it said, as plain text, cut short. */
	said: string | null;
	/** What went wrong, where that is the last thing that happened. */
	error: string | null;
	/** When the person (or an agent) last wrote to it: when the latest turn began. */
	askedAt: string | null;
};

const LONGEST = 280;

/** Markdown as one line of plain text: what a glance needs of it. */
export function plain(markdown: string, longest = LONGEST): string {
	const text = markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
		.replace(/(\*\*|__|`|~~)/g, '')
		.replace(/\|/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > longest ? `${text.slice(0, longest - 1).trimEnd()}…` : text;
}

export function glimpseOf(
	transcript: readonly TranscriptItem[],
	running: boolean,
	cwd?: string
): Glimpse {
	const question = transcript.findLast((item) => item.kind === 'question' && item.open);
	// a reply comes in pieces, one after another: all of the latest
	const end = transcript.findLastIndex((item) => item.kind === 'text');
	let start = end;
	while (start > 0 && transcript[start - 1].kind === 'text') start--;
	const said = transcript
		.slice(start, end + 1)
		.map((item) => (item.kind === 'text' ? item.text : ''))
		.join('');
	const last = transcript.at(-1);
	const tool = running && last?.kind === 'tool' && last.output === null ? last : null;
	return {
		asks:
			question?.kind === 'question'
				? question.questions.map((asked) => asked.question).join(' ')
				: null,
		doing: tool ? { icon: toolIcon(tool.name), text: doing(tool.name, tool.input, cwd) } : null,
		said: plain(said) || null,
		error: last?.kind === 'error' ? plain(last.error) : null,
		askedAt: transcript.findLast((item) => item.kind === 'user')?.at ?? null
	};
}

/** A tool call in a line: what it is run on, or its name while that is still to come. */
function doing(name: string, input: string, cwd?: string): string {
	const summary = toolSummary(input, cwd).trim();
	return summary && summary !== '{}' ? summary : name;
}
