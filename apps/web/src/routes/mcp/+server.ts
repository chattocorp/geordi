import { error, json } from '@sveltejs/kit';
import { archiveWorkspace, hub, standings, workspaces } from '#lib/server/app.ts';
import { handleMcp } from '#lib/server/mcp.ts';
import type { RequestHandler } from './$types';

/**
 * Geordi's agent API (ADR-004): an MCP server over HTTP. Each request is attributed to the workspace
 * or external agent grant that authenticated it.
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
				.catch((cause) => error(502, cause instanceof Error ? cause.message : String(cause))),
		// what an agent learns, the sidebar shows too: it is the same look
		standing: async (worktreeId: string) => {
			await standings().look(worktreeId);
			const known = standings().state(worktreeId);
			if (!known?.changes) error(502, known?.unavailable ?? 'No daemon could say');
			return { changes: known.changes, upstream: known.upstream };
		},
		harnesses: () => hub().harnesses()
	};
	const answer = await handleMcp(agents, caller, message);
	return answer ? json(answer) : new Response(null, { status: 202 });
};

/** No server-initiated messages: clients are told not to open a stream. */
export const GET: RequestHandler = () =>
	new Response(null, { status: 405, headers: { allow: 'POST' } });
