import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pickIcon, repoIcon } from './icon.ts';

describe('pickIcon', () => {
	it('prefers the file nearest the root, then the best name', () => {
		expect(pickIcon(['apps/docs-website/public/favicon.svg', 'favicon.png'])).toEqual({
			path: 'favicon.png',
			type: 'image/png'
		});
		expect(pickIcon(['apps/web/static/favicon.svg', 'apps/site/public/favicon.ico'])).toEqual({
			path: 'apps/web/static/favicon.svg',
			type: 'image/svg+xml'
		});
		expect(pickIcon(['a/b/c/favicon.png', 'static/Favicon.PNG'])?.path).toBe('static/Favicon.PNG');
	});

	it('finds nothing among other files, or where a project does not keep its own picture', () => {
		expect(pickIcon(['README.md', 'src/icons/arrow.svg'])).toBeNull();
		expect(pickIcon(['node_modules/x/favicon.ico', 'tests/fixtures/logo.svg'])).toBeNull();
	});
});

describe('repoIcon', () => {
	function repo(files: Record<string, string>) {
		const path = mkdtempSync(join(tmpdir(), 'geordi-icon-'));
		execFileSync('git', ['init', '-q', path]);
		for (const [name, content] of Object.entries(files)) {
			mkdirSync(dirname(join(path, name)), { recursive: true });
			writeFileSync(join(path, name), content);
		}
		return { path, add: () => execFileSync('git', ['-C', path, 'add', '-A']) };
	}

	it('reads the picture a repository has of itself', async () => {
		const { path, add } = repo({ 'web/static/favicon.svg': '<svg/>', 'README.md': 'hi' });
		expect(await repoIcon(path)).toBeNull(); // not tracked: not the repository's
		add();
		expect(await repoIcon(path)).toEqual({
			type: 'image/svg+xml',
			data: Buffer.from('<svg/>').toString('base64')
		});
	});

	it('does not follow a link, or take a file too big to be an icon', async () => {
		const linked = repo({ secret: 'not for showing' });
		symlinkSync(join(linked.path, 'secret'), join(linked.path, 'favicon.svg'));
		linked.add();
		expect(await repoIcon(linked.path)).toBeNull();

		const big = repo({ 'logo.png': 'x'.repeat(300 * 1024) });
		big.add();
		expect(await repoIcon(big.path)).toBeNull();
	});

	it('is nothing where there is no repository', async () => {
		expect(await repoIcon(join(tmpdir(), 'geordi-no-such-repo'))).toBeNull();
	});
});
