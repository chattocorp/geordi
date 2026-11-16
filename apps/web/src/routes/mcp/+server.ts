import { error, json } from '@sveltejs/kit';
import { archiveWorkspace, hub, workspaces } from '#lib/server/app.ts';
import { handleMcp } from '#lib/server/mcp.ts';
import type { RequestHandler } from './$types';

/**
 * Geordi's agent API (ADR-004): an MCP server over HTTP. Only agents get in, with the token
 * of their running turn; everything they do is done as their session.
 */
export const POST: RequestHandler = async ({ request }) => {
	const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
	const caller = token && workspaces().agents.authenticate(token);
	if (!caller) return new Response('Unauthorized', { status: 401 });

	let message;
	try {
		message = await request.json();
	} catch {
		return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
	}

	const agents = {
		...workspaces().agents,
		archive: (actor: string, id: string) => archiveWorkspace(id, false, actor),
		configuration: (id: string) =>
			hub()
				.request({ kind: 'config', ...workspaces().ref(id) })
				// no daemon, or no worktree: something the agent can be told
				.catch((cause) => error(502, cause instanceof Error ? cause.message : String(cause)))
	};
	const answer = await handleMcp(agents, caller, message);
	return answer ? json(answer) : new Response(null, { status: 202 });
};

/** No server-initiated messages: clients are told not to open a stream. */
export const GET: RequestHandler = () =>
	new Response(null, { status: 405, headers: { allow: 'POST' } });
