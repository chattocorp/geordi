import { highlighter, themes } from './highlighter.ts';

/** Keep large files readable without blocking the window on tokenization. */
export async function highlightFile(path: string, text: string, line?: number) {
	if (text.length > 100_000) return;

	const { getFiletypeFromFileName } = await import('@pierre/diffs');
	const lang = /\.svg$/i.test(path) ? 'xml' : getFiletypeFromFileName(path);
	if (lang === 'text') return;
	if (!highlighter.getLoadedLanguages().includes(lang)) {
		const { bundledLanguages } = await import('shiki/langs');
		if (!Object.hasOwn(bundledLanguages, lang)) return;
		await highlighter.loadLanguage(bundledLanguages[lang as keyof typeof bundledLanguages]());
	}

	return highlighter.codeToHtml(text, {
		lang,
		themes,
		defaultColor: 'light-dark()',
		transformers: [
			{
				line(node, number) {
					if (number !== line) return;
					node.tagName = 'mark';
					node.properties.class = 'tone-accent';
					node.properties['aria-label'] = `Line ${line}`;
					if (!node.children.length) node.children.push({ type: 'text', value: ' ' });
				},
				pre(node) {
					delete node.properties.style;
				}
			}
		]
	});
}
