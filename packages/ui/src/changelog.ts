/**
 * The release notes, read from the changelog Sweet Release writes (`CHANGELOG.md`): one
 * `## version` per release, a `### section` per kind of change, a `- note` per change.
 */
export type Release = { version: string; sections: { title: string; notes: Note[] }[] };

/** A note's inline Markdown, as much of it as notes use: code, strong emphasis and links. */
export type Note = Span[];
export type Span = { text: string; code?: true; strong?: true; href?: string };

/** The sections the release notes treat apart: the titles `.sweet.config.yml` gives them. */
export const HIGHLIGHTS = 'Highlights';
export const SMALLER_CHANGES = 'Smaller changes';

export function parseChangelog(markdown: string): Release[] {
	const releases: { version: string; sections: { title: string; notes: string[] }[] }[] = [];
	for (const line of markdown.split('\n')) {
		const sections = releases.at(-1)?.sections;
		const notes = sections?.at(-1)?.notes;
		if (line.startsWith('## ')) releases.push({ version: line.slice(3).trim(), sections: [] });
		else if (line.startsWith('### ')) sections?.push({ title: line.slice(4).trim(), notes: [] });
		else if (line.startsWith('- ')) notes?.push(line.slice(2).trim());
		// a note that goes on over more than one line
		else if (/^\s+\S/.test(line) && notes?.length) notes[notes.length - 1] += ` ${line.trim()}`;
	}
	return releases.map(({ version, sections }) => ({
		version,
		sections: sections.map(({ title, notes }) => ({ title, notes: notes.map(parseNote) }))
	}));
}

const inline = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function parseNote(text: string): Note {
	const note: Note = [];
	let at = 0;
	for (const match of text.matchAll(inline)) {
		if (match.index > at) note.push({ text: text.slice(at, match.index) });
		if (match[1] !== undefined) note.push({ text: match[1], code: true });
		else if (match[2] !== undefined) note.push({ text: match[2], strong: true });
		// only links to the web: a changelog has no business linking anywhere else
		else if (/^https?:\/\//.test(match[4])) note.push({ text: match[3], href: match[4] });
		else note.push({ text: match[3] });
		at = match.index + match[0].length;
	}
	if (at < text.length) note.push({ text: text.slice(at) });
	return note;
}
