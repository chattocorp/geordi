import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pickIcon, repoIcon, withIcons } from './icon.ts';
import { ensureWorktree } from './worktree.ts';

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

	it('prefers a picture put there for Geordi, which stands only for its own directory', () => {
		expect(pickIcon(['favicon.svg', '.geordi.png', 'logo.svg'])?.path).toBe('.geordi.png');
		// a section's picture is not the repository's
		expect(pickIcon(['apps/web/static/favicon.svg', 'docs/.geordi.svg'])?.path).toBe(
			'apps/web/static/favicon.svg'
		);
		expect(pickIcon(['docs/.geordi.svg'])).toBeNull();
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

describe('withIcons', () => {
	it('gives each section the picture nearest its directory, unless it names its own', async () => {
		const repoPath = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-sections-')));
		const files = {
			'apps/web/static/favicon.svg': '<svg/>',
			'apps/web/src/lib/logo.png': 'png',
			'apps/api/favicon.ico': 'ico',
			'apps/api/docs/icon.svg': '<svg/>',
			'packages/ui/src/assets/logo.svg': '<svg/>',
			'packages/ui/.geordi.svg': '<svg/>',
			'apps/web-admin/favicon.svg': '<svg/>',
			'docs/README.md': 'hi'
		};
		for (const [name, content] of Object.entries(files)) {
			mkdirSync(dirname(join(repoPath, name)), { recursive: true });
			writeFileSync(join(repoPath, name), content);
		}
		const git = (...args: string[]) =>
			execFileSync('git', ['-C', repoPath, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
		git('init', '-q');
		git('add', '-A');
		git('commit', '-qm', 'init');
		const base = realpathSync(mkdtempSync(join(tmpdir(), 'geordi-sections-base-')));
		const worktree = await ensureWorktree(base, { repoPath, worktreeId: 'abcdefgh-1' });
		expect(
			await withIcons(worktree, [
				{ path: 'apps/web', title: 'Web' },
				{ path: 'apps/api', title: 'API' },
				{ path: 'docs', title: 'Docs' },
				{ path: 'packages/ui', title: 'UI' },
				{ path: 'apps/web-admin', title: 'Admin', icon: 'brand/admin.png' }
			])
		).toEqual([
			// nearest its own directory, not the repository's
			{ path: 'apps/web', title: 'Web', icon: 'apps/web/static/favicon.svg' },
			// never an .ico: it could not be shown
			{ path: 'apps/api', title: 'API', icon: 'apps/api/docs/icon.svg' },
			{ path: 'docs', title: 'Docs' },
			// one put there for Geordi
			{ path: 'packages/ui', title: 'UI', icon: 'packages/ui/.geordi.svg' },
			{ path: 'apps/web-admin', title: 'Admin', icon: 'brand/admin.png' }
		]);
	});
});
