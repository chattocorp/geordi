import * as v from 'valibot';
import { redirect } from '@sveltejs/kit';
import { form, query } from '$app/server';
import { live } from '#lib/server/events/index.ts';
import { repos } from '#lib/server/app.ts';

export const getRepos = query.live(async function* () {
	yield* live(() => repos().list());
});

export const getRepo = query(v.string(), (id) => repos().get(id));

export const registerRepo = form(
	v.object({ path: v.pipe(v.string(), v.trim(), v.nonEmpty('Path is required')) }),
	({ path }) => {
		const repo = repos().register(path);
		redirect(303, `/repos/${repo.id}`);
	}
);
