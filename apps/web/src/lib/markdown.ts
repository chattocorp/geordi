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

const { escapeHtml } = md.utils;

// Images become plain links. Loading them would let agent output (which may be steered by
// prompt injection) send data to any server, simply by being displayed.
md.renderer.rules.image = (tokens, index) => {
	const src = String(tokens[index].attrGet('src') ?? '');
	return `<a href="${escapeHtml(src)}">${escapeHtml(tokens[index].content || src)}</a>`;
};

// Code blocks get a copy button; `Markdown.svelte` handles its clicks.
const fence = md.renderer.rules.fence!;
md.renderer.rules.fence = (...args) =>
	`<div class="code-block"><button type="button" data-copy aria-label="Copy code"></button>${fence(...args)}</div>`;

export const renderMarkdown = (text: string): string => md.render(text);
