import * as v from 'valibot';
import { redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { AGENTS, type FileChange, type Upstream } from '@geordi/protocol';
import { store } from '#lib/server/events/index.ts';
import { hub, terminals, workspaces } from '#lib/server/app.ts';
import { webUrl } from '#lib/url.ts';

const text = v.pipe(v.string(), v.trim(), v.nonEmpty('Write something first'));
const newSession = { agent: v.picklist(AGENTS), prompt: text };

export const getWorkspaces = query.live(v.string(), async function* (repoId) {
	yield* store().live(() => workspaces().list(repoId));
});

/**
 * One workspace with all of its sessions, so a page needs a single live connection. `parent`
 * is the workspace whose agent started this one, if any.
 */
export const getWorkspace = query.live(v.string(), async function* (id) {
	yield* store().live(() => {
		const workspace = workspaces().get(id);
		const parent = workspace.parentWorkspaceId
			? workspaces().summary(workspace.parentWorkspaceId)
			: null;
		return { ...workspace, parent: parent && { id: parent.id, title: parent.title } };
	});
});

export const createWorkspace = form(v.object({ repoId: v.string(), ...newSession }), (data) => {
	const id = workspaces().create(data);
	redirect(303, `/workspaces/${id}`);
});

/** Starts another agent session in a workspace. Returns the session's ID. */
export const createSession = command(
	v.object({ workspaceId: v.string(), ...newSession }),
	({ workspaceId, ...session }) => workspaces().addSession(workspaceId, session)
);

export const sendMessage = form(
	v.object({ sessionId: v.string(), text }),
	({ sessionId, text }) => {
		workspaces().send(sessionId, text);
	}
);

export const stopSession = command(v.string(), (id) => workspaces().stop(id));

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The files a workspace has changed since it branched off. Asked from the daemon each time
 * (the forge doesn't see the worktree); being unavailable is an expected state, not an error.
 */
export const getChanges = query(
	v.string(),
	async (id): Promise<{ files: FileChange[]; unavailable: string | null }> => {
		try {
			const files = await hub().request({ kind: 'changes', ...workspaces().ref(id) });
			return { files, unavailable: null };
		} catch (error) {
			return { files: [], unavailable: message(error) };
		}
	}
);

/**
 * How the workspace's branch stands on the forge its repository is hosted on: pushed or not,
 * and its pull request. `upstream` is `null` for repositories without such a forge.
 */
export const getUpstream = query(
	v.string(),
	async (id): Promise<{ upstream: Upstream | null; unavailable: string | null }> => {
		try {
			const upstream = await hub().request({ kind: 'upstream', ...workspaces().ref(id) });
			// These end up in links. They come from a daemon and, before that, another forge.
			if (upstream) {
				upstream.repoUrl = webUrl(upstream.repoUrl);
				upstream.createUrl = webUrl(upstream.createUrl);
				if (upstream.pull) upstream.pull.url = webUrl(upstream.pull.url);
				if (upstream.pull?.checks) upstream.pull.checks.url = webUrl(upstream.pull.checks.url);
			}
			return { upstream, unavailable: null };
		} catch (error) {
			return { upstream: null, unavailable: message(error) };
		}
	}
);

export const getDiff = query(
	v.object({ workspaceId: v.string(), path: v.string() }),
	async ({ workspaceId, path }) => {
		try {
			return await hub().request({ kind: 'diff', path, ...workspaces().ref(workspaceId) });
		} catch (error) {
			return `Could not load the diff: ${message(error)}\n`;
		}
	}
);

const dimension = v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(500));
const size = { cols: dimension, rows: dimension };
/** One of a workspace's terminals; the browser that opens a terminal names it. */
const terminal = {
	workspaceId: v.string(),
	terminal: v.pipe(v.string(), v.regex(/^[\w-]{1,40}$/))
};

/** Starts a terminal's shell. Only ever called because a person asked for a terminal. */
export const startTerminal = command(v.object({ ...terminal, ...size }), ({ cols, rows, ...at }) =>
	terminals().start(at, { cols, rows })
);

export const terminalInput = command(
	v.object({ ...terminal, data: v.string() }),
	({ data, ...at }) => terminals().input(at, data)
);

export const terminalResize = command(v.object({ ...terminal, ...size }), ({ cols, rows, ...at }) =>
	terminals().resize(at, { cols, rows })
);

export const closeTerminal = command(v.object(terminal), (at) => terminals().close(at));
