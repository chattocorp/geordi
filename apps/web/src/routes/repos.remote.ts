import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command } from '$app/server';
import { repos, workspaces } from '#lib/server/app.ts';

export const registerRepo = command(v.pipe(v.string(), v.trim(), v.nonEmpty()), (path) => {
	const { id, name } = repos().register(path);
	return { id, name };
});

export const removeRepo = command(v.string(), (id) => {
	// its workspaces' agents work in it: they go first
	if (workspaces().list(id).length > 0) error(409, 'Archive its workspaces first');
	repos().remove(id);
});
