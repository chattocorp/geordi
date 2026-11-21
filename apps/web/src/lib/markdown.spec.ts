import { describe, expect, it } from 'vitest';
import { changedFileIn, renderMarkdown } from './markdown.ts';

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
		const html = renderMarkdown('![The "new" page](shots/new%20page.png)', {
			pictures: '/workspaces/w1/picture'
		});
		expect(html).toContain('src="/workspaces/w1/picture?path=shots%2Fnew%20page.png"');
		expect(html).toContain('alt="The &quot;new&quot; page"');
		expect(html).toContain('data-picture="shots/new page.png"');
		expect(renderMarkdown('![x](/tmp/a.png)', { pictures: '/p' })).toContain(
			'src="/p?path=%2Ftmp%2Fa.png"'
		);
		expect(renderMarkdown('![x](a.png)', { pictures: '/p?at=3.1' })).toContain(
			'src="/p?at=3.1&amp;path=a.png"'
		);
	});

	it('plays sounds the agent has where it works', () => {
		const html = renderMarkdown('![Jump](assets/jump.wav)', { pictures: '/workspaces/w1/picture' });
		expect(html).toContain('<audio controls');
		expect(html).toContain('src="/workspaces/w1/picture?path=assets%2Fjump.wav"');
		expect(html).toContain('data-picture="assets/jump.wav"');
		expect(html).not.toContain('<img');
		expect(renderMarkdown('![x](https://example.com/a.mp3)', { pictures: '/p' })).not.toContain(
			'<audio'
		);
	});

	it('never loads a picture from elsewhere, nor any without a workspace to ask', () => {
		for (const src of ['https://evil.example/a.png', '//evil.example/a.png', 'HTTP://evil.example'])
			expect(renderMarkdown(`![x](${src})`, { pictures: '/p' })).not.toContain('<img');
		expect(renderMarkdown('![x](a.png)')).toBe('<p><a href="a.png">x</a></p>\n');
	});

	it('marks Mermaid and SVG code blocks as diagrams, to be drawn in their place', () => {
		expect(renderMarkdown('```mermaid\nflowchart LR\n  A --> B\n```')).toContain(
			'<div class="code-block" data-diagram="mermaid">'
		);
		expect(renderMarkdown('```svg\n<svg/>\n```')).toContain('data-diagram="svg"');
		expect(renderMarkdown('```ts\nconst a = 1;\n```')).not.toContain('data-diagram');
	});

	it('opens absolute worktree citations with an optional line and a formatted label', () => {
		const options = { root: '/work/tree', file: (name: string) => name };
		const html = renderMarkdown(
			'[`line`](</work/tree/a b.ts:139>) [whole](/work/tree/a%20b.ts "Read A & B")',
			options
		);
		expect(html).toContain('data-source="a b.ts" data-line="139"><code>line</code></button>');
		expect(html).toContain('data-source="a b.ts" title="Read A &amp; B">whole</button>');
		expect(html).not.toContain('data-file');
	});

	it('opens relative worktree links in diff panes', () => {
		const html = renderMarkdown('[`test`](./src/../tests/a%20b.ts:42) [read](README#usage)', {
			root: '/work/tree',
			file: () => 'another.ts'
		});
		expect(html).toContain('data-file="tests/a b.ts"><code>test</code></button>');
		expect(html).toContain('data-file="README">read</button>');
		expect(renderMarkdown('[read](README)')).toContain('<a href="README"');
	});

	it('preserves other Markdown links and ignores images when recognizing citations', () => {
		const options = { root: '/work/tree', pictures: '/picture' };
		for (const href of [
			'#here',
			'../outside',
			'src/%2e%2e/%2e%2e/private',
			'?query',
			'dir/',
			'/repos',
			'//example.com/x',
			'https://example.com/x',
			'/work/tree-other/a',
			'/work/tree/%2e%2e/private',
			'/work/tree/app?q=1'
		]) {
			expect(renderMarkdown(`[label](${href})`, options)).toContain(`<a href="${href}"`);
		}
		expect(renderMarkdown('![shot](/work/tree/shot.png)', options)).toContain(
			'data-picture="/work/tree/shot.png"'
		);
	});

	it('resolves document links and pictures from the Markdown file', () => {
		const options = { documentPath: 'docs/guide/start.md', pictures: '/picture?file' };
		expect(renderMarkdown('[Read](../notes.md)', options)).toContain('data-source="docs/notes.md"');
		expect(renderMarkdown('![Logo](img/logo.png)', options)).toContain(
			'path=docs%2Fguide%2Fimg%2Flogo.png'
		);
		expect(renderMarkdown('![Outside](../../../secret.png)', options)).not.toContain('<img');
		expect(renderMarkdown('![Remote](https://example.org/logo.png)', options)).not.toContain(
			'<img'
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

	it('links code that names a changed file to its diff', () => {
		const file = (code: string) => (code === 'a "b".ts' ? 'a "b".ts' : undefined);
		expect(renderMarkdown('See `a "b".ts` and `c.ts`.', { file })).toBe(
			'<p>See <button type="button" data-file="a &quot;b&quot;.ts" title="Show the changes to this file"><code>a &quot;b&quot;.ts</code></button> and <code>c.ts</code>.</p>\n'
		);
		expect(renderMarkdown('```\na "b".ts\n```', { file })).not.toContain('data-file');
	});
});

describe('changedFileIn', () => {
	const changed = new Set(['src/a.ts', 'README.md']);

	it('finds changed files named as they are, relative or absolute, with a line', () => {
		expect(changedFileIn('src/a.ts', changed)).toBe('src/a.ts');
		expect(changedFileIn('./src/a.ts', changed)).toBe('src/a.ts');
		expect(changedFileIn('src/a.ts:12', changed)).toBe('src/a.ts');
		expect(changedFileIn('src/a.ts:12:3', changed)).toBe('src/a.ts');
		expect(changedFileIn('/w/t/README.md', changed, '/w/t')).toBe('README.md');
	});

	it('finds nothing else', () => {
		expect(changedFileIn('a.ts', changed)).toBeUndefined();
		expect(changedFileIn('src/b.ts', changed)).toBeUndefined();
		expect(changedFileIn('/elsewhere/README.md', changed, '/w/t')).toBeUndefined();
		expect(changedFileIn('pnpm test', changed)).toBeUndefined();
	});
});

describe('agent review findings', () => {
	const options = { root: '/repo', agentDirectives: true };
	const finding = String.raw`::code-comment{file="src/a b.ts" priority=P1 start=8 end=10 title="Fix the boundary" body="Keep \"}\" and <script> literal."}`;
	it('renders adjacent findings and keeps surrounding paragraphs', () => {
		const html = renderMarkdown(['Before', finding, finding, 'After'].join('\n'), options);
		expect(html.match(/data-source="src\/a b.ts" data-line="8"/g)).toHaveLength(2);
		expect(html).toContain('[P1] Fix the boundary');
		expect(html).toContain('Keep &quot;}&quot; and &lt;script&gt; literal.');
		expect(html).toContain('<p>Before</p>');
		expect(html).toContain('<p>After</p>');
	});
	it('keeps examples and incomplete findings literal', () => {
		for (const text of [
			'```\n' + finding + '\n```',
			'`' + finding + '`',
			'> ' + finding,
			'    ' + finding,
			finding.slice(0, -1)
		]) {
			expect(renderMarkdown(text, options)).not.toContain('data-source');
		}
		expect(renderMarkdown(finding, { root: '/repo' })).toContain('::code-comment');
		expect(renderMarkdown(finding.replace('src/a b.ts', '../private'), options)).not.toContain(
			'data-source'
		);
	});
});
