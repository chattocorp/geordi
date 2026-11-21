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
	| { type: 'repo.removed'; stream: `repo:${string}`; data: { id: string } }
	/**
	 * A person moved the repository in the sidebar: right above `before`, or to the end of
	 * the list where that is `null`. Repositories are otherwise listed as they were registered.
	 */
	| {
			type: 'repo.moved';
			stream: `repo:${string}`;
			data: { id: string; before: string | null };
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

/** The repositories in their order, with `id` right above `before`, or last. */
function moved(repos: Map<string, Repo>, id: string, before: string | null): Map<string, Repo> {
	const moving = repos.get(id);
	if (!moving || id === before || (before !== null && !repos.has(before))) return repos;
	const entries = [...repos].filter(([other]) => other !== id);
	const at = before === null ? entries.length : entries.findIndex(([other]) => other === before);
	entries.splice(at, 0, [id, moving]);
	return new Map(entries);
}

export function createRepos(store: EventStore<GeordiEvent>) {
	/**
	 * Every ID ever given, removed repositories' too, with the path that had it last. An ID
	 * goes to no other path: what was granted to, or done in, a repository must not pass to
	 * another that happens to have its name.
	 */
	const known = new Map<string, string>();
	const projection = store.project(
		'repos',
		() => new Map<string, Repo>(),
		(repos, event) => {
			if (event.type === 'repo.registered') {
				repos.set(event.data.id, { ...event.data, registeredAt: event.at });
				known.set(event.data.id, event.data.path);
			}
			if (event.type === 'repo.removed') repos.delete(event.data.id);
			if (event.type === 'repo.moved') return moved(repos, event.data.id, event.data.before);
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
		list: (): Repo[] => [...projection.get().values()].map((repo) => ({ ...repo })),
		get,

		/**
		 * Registers a local repository; registering the same path twice returns the existing one.
		 * A repository registered again after it was removed gets its ID back, and with it its
		 * workspaces.
		 */
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
			const previous = [...known].find(([id, path]) => path === toplevel && !repos.has(id));
			let id = previous?.[0] ?? slug;
			if (!previous) for (let n = 2; known.has(id); n++) id = `${slug}-${n}`;

			store.append(
				{ type: 'repo.registered', stream: `repo:${id}`, data: { id, name, path: toplevel } },
				{ actor }
			);
			return get(id);
		},

		/** Moves a repository in the list: right above `before`, or to the end where that is `null`. */
		move(id: string, before: string | null, actor: string | null = null) {
			get(id);
			if (before !== null) get(before);
			if (before === id) return;
			store.append({ type: 'repo.moved', stream: `repo:${id}`, data: { id, before } }, { actor });
		},

		/**
		 * Forgets a repository. Nothing on disk changes, and registering it again brings it
		 * back, under the same ID. Its ID is not given to another. Whoever calls this makes sure nothing still works in it.
		 */
		remove(id: string, actor: string | null = null) {
			get(id);
			store.append({ type: 'repo.removed', stream: `repo:${id}`, data: { id } }, { actor });
		}
	};
}
