import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { error } from '@sveltejs/kit';
import type { EventStore, GeordiEvent } from './events/index.ts';

export type RepoEvent = {
	type: 'repo.registered';
	stream: `repo:${string}`;
	data: { id: string; name: string; path: string };
};

export type Repo = { id: string; name: string; path: string; registeredAt: string };

/** Resolves `path` (supporting `~`) to the top level of the Git repository containing it. */
function gitToplevel(path: string): string {
	const absolute = resolve(path.replace(/^~(?=$|\/)/, homedir()));
	try {
		return execFileSync('git', ['-C', absolute, 'rev-parse', '--show-toplevel'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		error(400, `Not a Git repository: ${path}`);
	}
}

export function createRepos(store: EventStore<GeordiEvent>) {
	const projection = store.project(
		'repos',
		() => new Map<string, Repo>(),
		(repos, event) => {
			if (event.type === 'repo.registered')
				repos.set(event.data.id, { ...event.data, registeredAt: event.at });
			return repos;
		}
	);

	function get(id: string): Repo {
		const repo = projection.get().get(id);
		if (!repo) error(404, `Repository ${id} not found`);
		return { ...repo };
	}

	return {
		list: (): Repo[] => [...projection.get().values()].map((repo) => ({ ...repo })),
		get,

		/** Registers a local repository; registering the same path twice returns the existing one. */
		register(path: string, actor: string | null = null): Repo {
			const toplevel = gitToplevel(path);
			const repos = projection.get();
			const existing = [...repos.values()].find((repo) => repo.path === toplevel);
			if (existing) return { ...existing };

			const name = basename(toplevel);
			let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
			for (let n = 2; repos.has(id); n++) id = `${name}-${n}`;

			store.append(
				{ type: 'repo.registered', stream: `repo:${id}`, data: { id, name, path: toplevel } },
				{ actor }
			);
			return get(id);
		}
	};
}
