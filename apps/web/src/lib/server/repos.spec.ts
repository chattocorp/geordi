import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createRepos } from './repos.ts';

function gitRepo(name: string) {
	const path = join(realpathSync(mkdtempSync(join(tmpdir(), 'geordi-repos-'))), name);
	execFileSync('git', ['init', '-q', path]);
	return path;
}

describe('repositories', () => {
	it('registers a repository once, under a name fit for URLs', () => {
		const repos = createRepos(new EventStore<GeordiEvent>(':memory:'));
		const path = gitRepo('My Project');

		expect(repos.register(path)).toMatchObject({ id: 'my-project', name: 'My Project', path });
		expect(repos.register(path).id).toBe('my-project');
		expect(repos.list()).toHaveLength(1);
		expect(repos.register(gitRepo('My Project')).id).toBe('my-project-2');
	});

	it('refuses what is not a Git repository', () => {
		const repos = createRepos(new EventStore<GeordiEvent>(':memory:'));
		expect(() => repos.register(mkdtempSync(join(tmpdir(), 'geordi-none-')))).toThrow();
	});

	it('forgets a removed repository, also after a restart, and takes it back', () => {
		const store = new EventStore<GeordiEvent>(':memory:');
		const repos = createRepos(store);
		const path = gitRepo('means');
		repos.register(path);

		repos.remove('means');
		expect(repos.list()).toEqual([]);
		expect(() => repos.remove('means')).toThrow();

		const restarted = createRepos(store); // replayed from the log
		expect(restarted.list()).toEqual([]);
		expect(restarted.register(path).id).toBe('means');
	});

	it("never gives a removed repository's ID to another", () => {
		const store = new EventStore<GeordiEvent>(':memory:');
		const repos = createRepos(store);
		const path = gitRepo('means');
		repos.register(path);
		repos.remove('means');

		const other = gitRepo('means');
		expect(repos.register(other).id).toBe('means-2');
		expect(createRepos(store).register(path).id).toBe('means');
		repos.remove('means-2');
		expect(createRepos(store).register(gitRepo('means')).id).toBe('means-3');
	});

	it('keeps the order people move repositories into, also after a restart', () => {
		const store = new EventStore<GeordiEvent>(':memory:');
		const repos = createRepos(store);
		for (const name of ['a', 'b', 'c']) repos.register(gitRepo(name));
		const ids = (list = repos.list()) => list.map((repo) => repo.id);

		repos.move('c', 'a');
		expect(ids()).toEqual(['c', 'a', 'b']);
		repos.move('c', null);
		expect(ids()).toEqual(['a', 'b', 'c']);
		repos.move('a', 'c');
		expect(ids()).toEqual(['b', 'a', 'c']);
		expect(ids(createRepos(store).list())).toEqual(['b', 'a', 'c']);
		expect(() => repos.move('a', 'nowhere')).toThrow();
	});
});
