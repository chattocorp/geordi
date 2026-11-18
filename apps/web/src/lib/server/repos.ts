import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { error } from '@sveltejs/kit';
import type { EventStore, GeordiEvent } from './events/index.ts';

export type RepoEvent =
	| {
			type: 'repo.registered';
			stream: `repo:${string}`;
			data: { id: string; name: string; path: string };
	  }
	| { type: 'repo.removed'; stream: `repo:${string}`; data: { id: string } };

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
	const registrations = new Map<string, { seq: number; path: string }[]>();
	const projection = store.project(
		'repos',
		() => new Map<string, Repo>(),
		(repos, event) => {
			if (event.type === 'repo.registered') {
				const history = registrations.get(event.data.id) ?? [];
				history.push({ seq: event.seq, path: event.data.path });
				registrations.set(event.data.id, history);
				repos.set(event.data.id, { ...event.data, registeredAt: event.at });
			}
			if (event.type === 'repo.removed') repos.delete(event.data.id);
			return repos;
		},
		['repo']
	);

	function get(id: string): Repo {
		const repo = projection.get().get(id);
		if (!repo) error(404, `Repository ${id} not found`);
		return { ...repo };
	}

	return {
		// Older installations could reuse an ID for a different path after removal.
		ownsWorkspace(id: string, created: number) {
			const path = registrations.get(id)?.findLast((reg) => reg.seq <= created)?.path;
			return !!path && path === projection.get().get(id)?.path;
		},
		list: (): Repo[] => [...projection.get().values()].map((repo) => ({ ...repo })),
		get,

		/** Registers a local repository; registering the same path twice returns the existing one. */
		register(path: string, actor: string | null = null): Repo {
			const toplevel = gitToplevel(path);
			const repos = projection.get();
			const existing = [...repos.values()].find((repo) => repo.path === toplevel);
			if (existing) return { ...existing };

			const name = basename(toplevel);
			// ends up in URLs and stream names: lower case, digits and dashes only
			const slug =
				name
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, '') || 'repo';
			let id = slug;
			for (
				let n = 2;
				repos.has(id) || registrations.get(id)?.some((reg) => reg.path !== toplevel);
				n++
			)
				id = `${slug}-${n}`;

			store.append(
				{ type: 'repo.registered', stream: `repo:${id}`, data: { id, name, path: toplevel } },
				{ actor }
			);
			return get(id);
		},

		/**
		 * Forgets a repository. Nothing on disk changes, and registering it again brings it
		 * back. Whoever calls this makes sure nothing still works in it.
		 */
		remove(id: string, actor: string | null = null) {
			get(id);
			store.append({ type: 'repo.removed', stream: `repo:${id}`, data: { id } }, { actor });
		}
	};
}
