// A browser completion is a whole assistant message. Indented Markdown code stays literal.
export const isBrowserCompletion = (text: string) =>
	/^(?:[ \t]*\r?\n)* {0,3}::browser-complete\{title="(?:[^"\\\r\n]|\\["\\])+"\}[ \t]*(?:\r?\n[ \t]*)*$/.test(
		text
	);

/** Read a line of review feedback. A quoted value may itself contain a brace or an escaped quote. */
export function codeComment(line: string) {
	const prefix = /^:{1,3}code-comment\{/.exec(line);
	if (!prefix) return;
	const fields = new Map<string, string>();
	const attribute =
		/[ \t]*([\w-]+)[ \t]*=[ \t]*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^"'\s}]+))/y;
	let offset = prefix[0].length;
	while (offset < line.length) {
		attribute.lastIndex = offset;
		const match = attribute.exec(line);
		if (!match) break;
		const [, key, double, single, bare] = match;
		if (fields.has(key)) return;
		const value = double?.replaceAll('\\"', '"') ?? single?.replaceAll("\\'", "'") ?? bare;
		fields.set(key, value.trim());
		offset = attribute.lastIndex;
	}
	if (!/^[ \t]*\}[ \t]*$/.test(line.slice(offset))) return;
	const title = fields.get('title');
	const body = fields.get('body');
	const file = fields.get('file');
	if (!title || !body || !file) return;
	const priority = /^p?([0-3])$/i.exec(fields.get('priority') ?? '')?.[1];
	const lineNumber = (key: string) => {
		const value = Number(fields.get(key));
		return Number.isSafeInteger(value) && value > 0 ? value : undefined;
	};
	const start = lineNumber('start') ?? 1;
	return {
		title: priority && !/^\[P[0-3]\]/i.test(title) ? `[P${priority}] ${title}` : title,
		body,
		file,
		start,
		end: Math.max(start, lineNumber('end') ?? start)
	};
}
