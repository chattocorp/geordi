import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.ts';
import { workspaceLinks } from './workspace-links.ts';

const listed = [
	{ id: 'here', repoId: 'a', branch: 'geordi/here', pull: null },
	{
		id: 'w1',
		repoId: 'a',
		branch: 'geordi/fix-login',
		pull: { number: '42', url: 'https://github.com/o/a/pull/42' }
	},
	{ id: 'w2', repoId: 'b', branch: 'geordi/fix-login', pull: null },
	{
		id: 'w3',
		repoId: 'b',
		branch: 'geordi/other',
		pull: { number: '7', url: 'https://github.com/o/b/pull/7' }
	}
];
const links = workspaceLinks(listed, 'here');

describe('workspaceLinks', () => {
	it('finds a branch in the repository on screen first, elsewhere only where it is unique', () => {
		expect(links.branch('geordi/fix-login')).toBe('w1');
		expect(links.branch('geordi/other')).toBe('w3');
		expect(workspaceLinks(listed, null).branch('geordi/fix-login')).toBeUndefined();
	});

	it('never links a workspace to itself', () => {
		expect(links.branch('geordi/here')).toBeUndefined();
	});

	it('finds a pull request by its address, also one of its tabs', () => {
		expect(links.pull('https://github.com/o/b/pull/7')).toBe('w3');
		expect(links.pull('https://github.com/o/a/pull/42/files#diff-1')).toBe('w1');
		expect(links.pull('https://github.com/o/a/pull/4')).toBeUndefined();
	});

	it('finds a pull request by its number only in the repository on screen', () => {
		expect(links.number('42')).toBe('w1');
		expect(links.number('7')).toBeUndefined();
	});
});

describe('renderMarkdown with workspaces', () => {
	const render = (text: string) => renderMarkdown(text, { workspaces: links });

	it('links a branch written as code', () => {
		expect(render('See `geordi/fix-login`.')).toContain(
			'<a href="/workspaces/w1"><code>geordi/fix-login</code></a>'
		);
		expect(render('See `main`.')).not.toContain('<a');
	});

	it('links a pull request by its address, bare or as a link', () => {
		expect(render('https://github.com/o/b/pull/7')).toContain('href="/workspaces/w3"');
		expect(render('[the fix](https://github.com/o/a/pull/42)')).toContain(
			'<a href="/workspaces/w1">the fix</a>'
		);
	});

	it('links a pull request by its number', () => {
		expect(render('Merged #42 and #43.')).toBe(
			'<p>Merged <a href="/workspaces/w1">#42</a> and #43.</p>\n'
		);
		expect(render('[#42](https://example.com)')).not.toContain('/workspaces/');
		expect(render('a&#42;b')).not.toContain('/workspaces/');
	});
});
