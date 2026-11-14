import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.ts';

describe('renderMarkdown', () => {
	it('escapes raw HTML', () => {
		expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img');
	});

	it('renders images as links, so displaying output never loads remote resources', () => {
		const html = renderMarkdown('![secret "data"](https://evil.example/?q=1&x="2")');
		expect(html).not.toContain('<img');
		expect(html).toContain(
			'<a href="https://evil.example/?q=1&amp;x=%222%22">secret &quot;data&quot;</a>'
		);
	});

	it('highlights known languages for both themes', () => {
		const html = renderMarkdown('```ts\nconst a = 1;\n```');
		expect(html).toContain('--shiki-light');
		expect(html).toContain('--shiki-dark');
		expect(html).toContain('data-copy');
	});

	it('renders unknown languages as plain, escaped code', () => {
		const html = renderMarkdown('```nonsense\n<b>hi</b>\n```');
		expect(html).not.toContain('<b>');
		expect(html).toContain('hi');
	});
});
