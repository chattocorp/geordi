import { codeComment } from './agent-directives.ts';
import MarkdownIt, { type Token } from 'markdown-it';
import { highlighter, themes } from './highlighter.ts';
import type { WorkspaceLinks } from './workspace-links.ts';

/**
 * Renders agent output. Raw HTML is disabled (escaped), and markdown-it rejects unsafe link
 * protocols such as `javascript:`, so the result is safe to insert with `{@html}`.
 */
const md = new MarkdownIt({
	html: false,
	linkify: true,
	highlight(code, lang) {
		const known = highlighter.getLoadedLanguages().includes(lang);
		return highlighter.codeToHtml(code, {
			lang: known ? lang : 'text',
			themes,
			defaultColor: false
		});
	}
});

md.renderer.rules.softbreak = (_tokens, _index, _options, env) =>
	(env as Options).preserveLineBreaks ? '<br>\n' : '\n';

const { escapeHtml } = md.utils;

// A block rule leaves fenced and inline code examples to Markdown.
md.block.ruler.before(
	'paragraph',
	'code_comment',
	(state, line, _end, silent) => {
		if (
			!(state.env as Options).agentDirectives ||
			state.parentType === 'blockquote' ||
			state.sCount[line] - state.blkIndent >= 4
		)
			return false;
		const source = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
		const finding = codeComment(source);
		if (!finding) return false;
		if (!silent) {
			const token = state.push('code_comment', '', 0);
			token.meta = finding;
			state.line = line + 1;
		}
		return true;
	},
	{ alt: ['paragraph'] }
);

md.renderer.rules.code_comment = (tokens, index, _options, env) => {
	const { title, body, file, start, end } = tokens[index].meta as NonNullable<
		ReturnType<typeof codeComment>
	>;
	const root = (env as Options).root;
	const path =
		root && file.startsWith(root + '/') ? file.slice(root.length + 1) : file.replace(/^\.\//, '');
	const location = `<code>${escapeHtml(path)}:${start}${end > start ? '–' + end : ''}</code>`;
	const inWorkspace =
		root &&
		local(path) &&
		!path.startsWith('/') &&
		!/[\\\0]/.test(path) &&
		!path.split('/').includes('..');
	const link = inWorkspace
		? `<button type="button" data-source="${escapeHtml(path)}" data-line="${start}">${location}</button>`
		: location;
	return `<p><strong>${escapeHtml(title)}</strong> · ${link}<br>${escapeHtml(body)}</p>\n`;
};

/** Names of sound files, which a Markdown image of them plays. */
const SOUND = /\.(wav|mp3|ogg|oga|opus|flac|m4a)$/i;

/** Whether a link leads to a file where the agent works, rather than somewhere on the net. */
const local = (src: string) => src !== '' && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);

// Pictures the agent has where it works are shown: the forge serves them (`pictures` is
// where it does), and `Markdown.svelte` puts the path back where one cannot be had. Any
// other image becomes a plain link. Loading it would let agent output (which may be
// steered by prompt injection) send data to any server, simply by being displayed.
md.renderer.rules.image = (tokens, index, _options, env) => {
	const pictures = (env as { pictures?: string } | undefined)?.pictures;
	const src = String(tokens[index].attrGet('src') ?? '');
	const alt = escapeHtml(tokens[index].content);
	const documentPath = (env as Options).documentPath;
	if (!pictures || !local(src)) return `<a href="${escapeHtml(src)}">${alt || escapeHtml(src)}</a>`;
	let path = src; // markdown-it has it encoded as a URL
	try {
		path = decodeURIComponent(src);
	} catch {
		// not encoded the way it looked: as written, then
	}
	if (documentPath) {
		const resolved = documentLink(src, documentPath);
		if (!resolved) return alt;
		path = resolved;
	}
	const url = escapeHtml(
		`${pictures}${pictures.includes('?') ? '&' : '?'}path=${encodeURIComponent(path)}`
	);
	// A sound gets a player (`Markdown.svelte` puts it here). Its name only says so: the forge
	// serves what the bytes are.
	if (SOUND.test(path))
		return `<span class="not-prose my-3 block max-w-md card px-3 py-2" data-sound="${url}" data-label="${alt || escapeHtml(path)}" data-sound-path="${escapeHtml(path)}"></span>`;
	return `<a href="${url}" target="_blank" rel="noreferrer"><img src="${url}" alt="${alt}" data-picture="${escapeHtml(path)}" loading="lazy"></a>`;
};

function sourceLink(href: string, root?: string) {
	if (!root || !href.startsWith('/') || href.startsWith('//') || /[?#]/.test(href)) return;
	let path: string;
	try {
		path = decodeURIComponent(href);
	} catch {
		return;
	}
	if (!path.startsWith(root + '/')) return;
	const target = path.slice(root.length + 1);
	const suffix = /:(\d+)$/.exec(target);
	const file = suffix ? target.slice(0, suffix.index) : target;
	if (file && !file.split('/').includes('..')) return { file, line: suffix?.[1] };
}

/** A relative Markdown destination is resolved from the root of the worktree. */
function diffLink(href: string) {
	if (!local(href) || href.startsWith('/') || href.includes('?')) return;
	const destination = href.split('#', 1)[0];
	let path: string;
	try {
		path = decodeURIComponent(destination).replace(/:\d+(?::\d+)?$/, '');
	} catch {
		return;
	}
	if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return;
	if (/(^|\/)(\.{1,2})?$/.test(path)) return;
	const parts: string[] = [];
	for (const part of path.split('/')) {
		if (part === '..') {
			if (!parts.pop()) return;
		} else if (part && part !== '.') parts.push(part);
	}
	return parts.join('/');
}

function documentLink(href: string, documentPath: string) {
	if (!local(href) || href.startsWith('/')) return;
	const directory = documentPath.slice(0, documentPath.lastIndexOf('/') + 1);
	return diffLink(encodeURI(directory).replaceAll('#', '%23').replaceAll('?', '%3F') + href);
}

// Preserve the inline markup in link labels, including code that names a changed file.
md.core.ruler.after('inline', 'workspace_links', (state) => {
	const { root, workspaces } = state.env as Options;
	for (const block of state.tokens) {
		let inLink = false;
		let tag: string | undefined;
		const children: typeof state.tokens = [];
		for (const token of block.children ?? []) {
			children.push(token);
			if (token.type === 'link_open') {
				inLink = true;
				const href = String(token.attrGet('href') ?? '');
				// another workspace's pull request: to that workspace
				const pulled = /^https?:/i.test(href) && workspaces?.pull(href);
				if (pulled) {
					token.attrSet('href', workspaceHref(pulled));
					continue;
				}
				// a directory: `Markdown.svelte` makes it a button once the daemon confirms it is one
				const folder =
					href.endsWith('/') && !/[?#]/.test(href) && worktreePath(decoded(href), root);
				if (folder) {
					tag = token.tag = 'span';
					token.attrs = [['data-path', folder.path]];
					continue;
				}
				const citation = sourceLink(href, root);
				const doc = (state.env as Options).documentPath;
				const path = citation?.file ?? (doc ? documentLink(href, doc) : root && diffLink(href));
				if (!path) continue;
				tag = 'button';
				const title = token.attrGet('title');
				token.tag = 'button';
				token.attrs = [
					['type', 'button'],
					[citation || doc ? 'data-source' : 'data-file', path]
				];
				if (title !== null) token.attrSet('title', title);
				if (citation?.line) token.attrSet('data-line', citation.line);
			} else if (token.type === 'link_close') {
				if (tag) token.tag = tag;
				tag = undefined;
				inLink = false;
			} else if (inLink && token.type === 'code_inline') token.meta = { inLink: true };
			else if (!inLink && workspaces && token.type === 'text') {
				children.pop();
				children.push(...pullNumbers(token, workspaces, state.Token));
			}
		}
		if (block.children) block.children = children;
	}
});

const workspaceHref = (id: string) => `/workspaces/${encodeURIComponent(id)}`;

/** A pull request named by its number (`#42`) in text, and where its workspace is. */
const PULL_NUMBER = /(?<![\w&/#])#(\d+)\b/g;

/** Text with `#42` in it, split so that each number of a workspace's pull request links there. */
function pullNumbers(token: Token, workspaces: WorkspaceLinks, Make: typeof Token): Token[] {
	const out: Token[] = [];
	const text = (content: string) => {
		if (!content) return;
		const piece = new Make('text', '', 0);
		piece.content = content;
		out.push(piece);
	};
	let last = 0;
	for (const match of token.content.matchAll(PULL_NUMBER)) {
		const id = workspaces.number(match[1]);
		if (!id) continue;
		text(token.content.slice(last, match.index));
		const open = new Make('link_open', 'a', 1);
		open.attrs = [['href', workspaceHref(id)]];
		out.push(open);
		text(match[0]);
		out.push(new Make('link_close', 'a', -1));
		last = match.index + match[0].length;
	}
	if (!last) return [token];
	text(token.content.slice(last));
	return out;
}

const decoded = (href: string) => {
	try {
		return decodeURIComponent(href);
	} catch {
		return href;
	}
};

/**
 * The worktree-relative path (`.` for the worktree itself) of what may be a file or a
 * directory there, and the line it may name (`:12`, perhaps with a column): a path relative
 * to the worktree (`root`) or absolute within it, with a slash or an extension so that not
 * every word in code is asked about. Whether it is either only the daemon knows.
 */
export function worktreePath(
	text: string,
	root?: string
): { path: string; line?: number } | undefined {
	if (!root) return;
	let path = text.trim();
	const suffix = /:(\d+)(?::\d+)?$/.exec(path);
	if (suffix) path = path.slice(0, suffix.index);
	const line = suffix ? Number(suffix[1]) : undefined;
	if (path === root || path === `${root}/`) return { path: '.' };
	if (path.startsWith(`${root}/`)) path = path.slice(root.length + 1);
	else if (path.startsWith('/') || path.startsWith('~') || !/\/|.\.\w+$/.test(path)) return;
	path = path.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
	if (!path || !local(path) || /[\s\\\0]/.test(path)) return;
	if (path.split('/').some((part) => part === '' || part === '.' || part === '..')) return;
	return line ? { path, line } : { path };
}

/** Code blocks in these languages are drawn (`diagrams.ts`); until then, or if they cannot be, they stay code. */
const DIAGRAMS = ['mermaid', 'svg'];

// Code blocks get a copy button; `Markdown.svelte` handles its clicks.
const fence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, index, options, env, self) => {
	const lang = tokens[index].info.trim().split(/\s+/, 1)[0];
	const diagram = DIAGRAMS.includes(lang) ? ` data-diagram="${lang}"` : '';
	return `<div class="code-block"${diagram}><button type="button" data-copy aria-label="Copy code"></button>${fence(tokens, index, options, env, self)}</div>`;
};

// Code that names a file the workspace has changed (`file` says which, if any) opens its
// diff when clicked; `Markdown.svelte` handles the clicks.
const codeInline = md.renderer.rules.code_inline!;
md.renderer.rules.code_inline = (tokens, index, options, env, self) => {
	const code = codeInline(tokens, index, options, env, self);
	if (tokens[index].meta?.inLink) return code;
	const path = (env as Options | undefined)?.file?.(tokens[index].content);
	if (!path) {
		// another workspace's branch: to that workspace
		const branch = (env as Options | undefined)?.workspaces?.branch(tokens[index].content.trim());
		if (branch) return `<a href="${escapeHtml(workspaceHref(branch))}">${code}</a>`;
		// a file or directory: `Markdown.svelte` makes it a button once the daemon says which
		const found = worktreePath(tokens[index].content, (env as Options | undefined)?.root);
		if (!found) return code;
		const line = found.line ? ` data-line="${found.line}"` : '';
		return code.replace('<code', `<code data-path="${escapeHtml(found.path)}"${line}`);
	}
	return `<button type="button" data-file="${escapeHtml(path)}" title="Show the changes to this file">${code}</button>`;
};

type Options = {
	agentDirectives?: boolean;
	documentPath?: string;
	preserveLineBreaks?: boolean;
	root?: string;
	/**
	 * The address that serves the pictures of the workspace this was written in
	 * (`/workspaces/<id>/picture`, perhaps with a query of its own). Without it, as for text
	 * from elsewhere, none are shown.
	 */
	pictures?: string;
	/** The changed file that code in a sentence names, if it names one. */
	file?: (code: string) => string | undefined;
	/** The workspaces that a branch or pull request named here links to. */
	workspaces?: WorkspaceLinks;
};

export const renderMarkdown = (text: string, options: Options = {}): string =>
	md.render(text, options);

/**
 * The file among `changed` that `code` names, if any: as a path in the worktree (`root`),
 * absolute or relative, perhaps followed by a line (`:12`) and column.
 */
export function changedFileIn(
	code: string,
	changed: ReadonlySet<string>,
	root?: string
): string | undefined {
	let path = code.trim().replace(/:\d+(:\d+)?$/, '');
	if (root && path.startsWith(`${root}/`)) path = path.slice(root.length + 1);
	path = path.replace(/^\.\//, '');
	return changed.has(path) ? path : undefined;
}
