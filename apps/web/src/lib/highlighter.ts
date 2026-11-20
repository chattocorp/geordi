import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/** Code is coloured by both themes at once; `layout.css` picks the one for the current mode. */
export const highlighter = await createHighlighterCore({
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

export const themes = { light: 'github-light', dark: 'github-dark-dimmed' };
