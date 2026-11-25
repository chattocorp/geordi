import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command } from '$app/server';
import { hub, removeRepository, repos } from '#lib/server/app.ts';

export const registerRepo = command(v.pipe(v.string(), v.trim(), v.nonEmpty()), (path) => {
	const { id, name } = repos().register(path);
	return { id, name };
});

export const removeRepo = command(v.string(), removeRepository);

export const checkRepoForge = command(v.string(), async (id) => {
	const repoPath = repos().get(id).path;
	try {
		return await hub().request({ kind: 'checkForge', repoPath }, 30_000);
	} catch {
		error(503, 'Could not ask the daemon');
	}
});

export const moveRepo = command(
	v.object({ repoId: v.string(), before: v.nullable(v.string()) }),
	({ repoId, before }) => repos().move(repoId, before, 'person')
);
