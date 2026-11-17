import * as v from 'valibot';
import { command } from '$app/server';
import { homeWorkspace, removeRepo as remove, repos } from '#lib/server/app.ts';

export const registerRepo = command(v.pipe(v.string(), v.trim(), v.nonEmpty()), (path) => {
	// with its own workspace, which every repository has (FDR-009)
	homeWorkspace(repos().register(path).id);
});

export const removeRepo = command(v.string(), (id) => remove(id));
