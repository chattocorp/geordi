import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import { problemOf } from '#lib/problem.ts';
import { hub, repos, workspaces } from '#lib/server/app.ts';

export const registerRepo = command(v.pipe(v.string(), v.trim(), v.nonEmpty()), (path) => {
	repos().register(path);
});

export const removeRepo = command(v.string(), (id) => {
	// its workspaces' agents work in it: they go first
	if (workspaces().list(id).length > 0) error(409, 'Archive its workspaces first');
	repos().remove(id);
});

export const getRepositoryThreads = query(
	v.object({
		id: v.string(),
		category: v.picklist(['issue', 'pull_request']),
		after: v.optional(v.string())
	}),
	async ({ id, category, after }) => {
		const repoPath = repos().get(id).path;
		try {
			return await hub().request({ kind: 'repoThreads', repoPath, category, after }, 45_000);
		} catch (cause) {
			return { problem: problemOf(cause, 'Could not read this repository.') };
		}
	}
);
