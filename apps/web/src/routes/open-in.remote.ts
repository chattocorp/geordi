import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command } from '$app/server';
import { openIn, terminals, workspaces } from '#lib/server/app.ts';
import { OPEN_IN_TERMINAL } from '#lib/open-in.ts';

const id = v.pipe(v.string(), v.uuid());
const text = v.pipe(v.string(), v.trim(), v.nonEmpty());
export const saveOpenIn = command(
	v.object({
		revision: v.number(),
		apps: v.array(v.object({ id, name: text, command: text, enabled: v.boolean() }))
	}),
	(settings) => openIn().save(settings)
);

export const launchApp = command(
	v.object({ workspaceId: v.string(), appId: id, revision: v.number() }),
	({ workspaceId, appId, revision }) => {
		const settings = openIn().get();
		const app = settings.apps.find((entry) => entry.id === appId && entry.enabled);
		if (!app || settings.revision !== revision)
			error(409, 'Open in settings changed. Choose the app again.');
		const workspace = workspaces().summary(workspaceId);
		if (workspace.archivedAt || !workspace.worktree || !workspace.repoId)
			error(409, 'This workspace has no active worktree');
		const terminal = OPEN_IN_TERMINAL + appId;
		if (!terminals().launch({ workspaceId, terminal }, app.command))
			error(503, 'No daemon connected');
		return terminal;
	}
);
