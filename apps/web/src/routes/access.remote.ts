import * as v from 'valibot';
import { command } from '$app/server';
import { workspaces } from '#lib/server/app.ts';

/**
 * Issues a named token for an MCP client outside Geordi (ADR-004), for the repositories
 * chosen. It is returned once.
 */
export const issueAccess = command(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(80)),
		repoIds: v.array(v.string())
	}),
	({ name, repoIds }) => workspaces().access.issue(name, repoIds)
);

export const revokeAccess = command(v.string(), (id) => workspaces().access.revoke(id));
