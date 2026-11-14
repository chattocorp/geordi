import * as v from 'valibot';
import { redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { AGENTS } from '@geordi/protocol';
import { store } from '#lib/server/events/index.ts';
import { sessions } from '#lib/server/app.ts';

const text = v.pipe(v.string(), v.trim(), v.nonEmpty('Write something first'));

export const getSessions = query.live(v.string(), async function* (repoId) {
	yield* store().live(() => sessions().list(repoId));
});

export const getSession = query.live(v.string(), async function* (id) {
	yield* store().live(() => sessions().get(id));
});

export const createSession = form(
	v.object({ repoId: v.string(), agent: v.picklist(AGENTS), prompt: text }),
	(data) => {
		const id = sessions().create(data);
		redirect(303, `/sessions/${id}`);
	}
);

export const sendMessage = form(
	v.object({ sessionId: v.string(), text }),
	({ sessionId, text }) => {
		sessions().send(sessionId, text);
	}
);

export const stopSession = command(v.string(), (id) => sessions().stop(id));
