import MarkdownIt from 'markdown-it';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/** Code is coloured by both themes at once; `layout.css` picks the one for the current mode. */
const highlighter = await createHighlighterCore({
	engine: createJavaScriptRegexEngine(),
	themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark-dimmed.mjs')],
	langs: [
		import('shiki/langs/bash.mjs'),
		import('shiki/langs/css.mjs'),
		import('shiki/langs/diff.mjs'),
		import('shiki/langs/go.mjs'),
		import('shiki/langs/html.mjs'),
		import('shiki/langs/json.mjs'),
		import('shiki/langs/markdown.mjs'),
		import('shiki/langs/python.mjs'),
		import('shiki/langs/rust.mjs'),
		import('shiki/langs/sql.mjs'),
		import('shiki/langs/svelte.mjs'),
		import('shiki/langs/tsx.mjs'),
		import('shiki/langs/typescript.mjs'),
		import('shiki/langs/yaml.mjs')
	]
});

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
			themes: { light: 'github-light', dark: 'github-dark-dimmed' },
			defaultColor: false
		});
	}
});

md.renderer.rules.softbreak = (_tokens, _index, _options, env) =>
	(env as Options).preserveLineBreaks ? '<br>\n' : '\n';

const { escapeHtml } = md.utils;

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
	if (!pictures || !local(src)) return `<a href="${escapeHtml(src)}">${alt || escapeHtml(src)}</a>`;
	let path = src; // markdown-it has it encoded as a URL
	try {
		path = decodeURIComponent(src);
	} catch {
		// not encoded the way it looked: as written, then
	}
	const url = escapeHtml(`${pictures}?path=${encodeURIComponent(path)}`);
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

// Preserve the inline markup in link labels, including code that names a changed file.
md.core.ruler.after('inline', 'workspace_links', (state) => {
	const root = (state.env as Options).root;
	for (const block of state.tokens) {
		let inLink = false;
		let button = false;
		for (const token of block.children ?? []) {
			if (token.type === 'link_open') {
				inLink = true;
				const href = String(token.attrGet('href') ?? '');
				const citation = sourceLink(href, root);
				const path = citation?.file ?? (root && diffLink(href));
				if (!path) continue;
				button = true;
				const title = token.attrGet('title');
				token.tag = 'button';
				token.attrs = [
					['type', 'button'],
					[citation ? 'data-source' : 'data-file', path]
				];
				if (title !== null) token.attrSet('title', title);
				if (citation?.line) token.attrSet('data-line', citation.line);
			} else if (token.type === 'link_close') {
				if (button) token.tag = 'button';
				button = inLink = false;
			} else if (inLink && token.type === 'code_inline') token.meta = { inLink: true };
		}
	}
});

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
	if (!path) return code;
	return `<button type="button" data-file="${escapeHtml(path)}" title="Show the changes to this file">${code}</button>`;
};

type Options = {
	preserveLineBreaks?: boolean;
	root?: string;
	/**
	 * The address that serves the pictures of the workspace this was written in
	 * (`/workspaces/<id>/picture`). Without it, as for text from elsewhere, none are shown.
	 */
	pictures?: string;
	/** The changed file that code in a sentence names, if it names one. */
	file?: (code: string) => string | undefined;
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
