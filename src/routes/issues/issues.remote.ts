import * as v from 'valibot';
import { command, form, query } from '$app/server';
import { store } from '#lib/server/events/index.ts';
import { issues } from '#lib/server/issues.ts';

export const getIssues = query.live(async function* () {
	yield* store().live(() => issues().list());
});

export const openIssue = form(
	v.object({
		title: v.pipe(v.string(), v.trim(), v.nonEmpty('Title is required')),
		body: v.optional(v.string(), '')
	}),
	(data) => {
		issues().open(data);
	}
);

export const closeIssue = command(v.number(), (number) => issues().close(number));
export const reopenIssue = command(v.number(), (number) => issues().reopen(number));
