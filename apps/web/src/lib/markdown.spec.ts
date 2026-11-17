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

	it('shows pictures the agent has where it works, served by the forge', () => {
		const html = renderMarkdown(
			'![The "new" page](shots/new%20page.png)',
			'/workspaces/w1/picture'
		);
		expect(html).toContain('src="/workspaces/w1/picture?path=shots%2Fnew%20page.png"');
		expect(html).toContain('alt="The &quot;new&quot; page"');
		expect(html).toContain('data-picture="shots/new page.png"');
		expect(renderMarkdown('![x](/tmp/a.png)', '/p')).toContain('src="/p?path=%2Ftmp%2Fa.png"');
	});

	it('never loads a picture from elsewhere, nor any without a workspace to ask', () => {
		for (const src of ['https://evil.example/a.png', '//evil.example/a.png', 'HTTP://evil.example'])
			expect(renderMarkdown(`![x](${src})`, '/p')).not.toContain('<img');
		expect(renderMarkdown('![x](a.png)')).toBe('<p><a href="a.png">x</a></p>\n');
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
