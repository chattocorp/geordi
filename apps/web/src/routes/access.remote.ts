import * as v from 'valibot';
import { command } from '$app/server';
import { workspaces } from '#lib/server/app.ts';

/** Issues a named token for an MCP client outside Geordi (ADR-004). It is returned once. */
export const issueAccess = command(
	v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(80)),
	(name) => workspaces().access.issue(name)
);

export const revokeAccess = command(v.string(), (id) => workspaces().access.revoke(id));
