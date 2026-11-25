import * as v from 'valibot';
import { command } from '$app/server';
import { workspaces } from '#lib/server/app.ts';

/** Changes what was chosen for the whole installation in Settings. */
export const setPreferences = command(
	v.partial(v.object({ identifyClaude: v.boolean() })),
	(change) => workspaces().preferences.set(change)
);
