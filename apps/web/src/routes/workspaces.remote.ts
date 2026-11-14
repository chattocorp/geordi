import * as v from 'valibot';
import { redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { AGENTS, type FileChange, type FileVersions, type Upstream } from '@geordi/protocol';
import { store } from '#lib/server/events/index.ts';
import { hub, terminals, watchers, workspaces } from '#lib/server/app.ts';
import { webUrl } from '#lib/url.ts';

const text = v.pipe(v.string(), v.trim(), v.nonEmpty('Write something first'));

export const getWorkspaces = query.live(v.string(), async function* (repoId) {
	yield* store().live(() => workspaces().list(repoId));
});

/**
 * One workspace with its conversation. `parent` is the workspace whose agent started this
 * one, if any.
 *
 * While someone has this open, a daemon watches the workspace's files; `filesRevision` is
 * different after every change to them, which is the cue to ask for the changes again.
 */
export const getWorkspace = query.live(v.string(), async function* (id) {
	yield* store().live(
		() => {
			const workspace = workspaces().get(id);
			const parent = workspace.parentId ? workspaces().summary(workspace.parentId) : null;
			return {
				...workspace,
				parent: parent && { id: parent.id, title: parent.title },
				filesRevision: watchers().revision()
			};
		},
		(changed) => watchers().watch(workspaces().summary(id).worktreeId, changed)
	);
});

export const createWorkspace = form(
	v.object({ repoId: v.string(), agent: v.picklist(AGENTS), prompt: text }),
	(data) => {
		const id = workspaces().create(data);
		redirect(303, `/workspaces/${id}`);
	}
);

export const sendMessage = form(
	v.object({ workspaceId: v.string(), text }),
	({ workspaceId, text }) => {
		workspaces().send(workspaceId, text);
	}
);

/** Stops the workspace's agent, if it is working. */
export const stopAgent = command(v.string(), (id) => workspaces().stop(id));

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

/** Both versions of a changed file, for the diff viewer. */
export const getDiff = query(
	v.object({ workspaceId: v.string(), path: v.string() }),
	async ({ workspaceId, path }): Promise<FileVersions> => {
		try {
			return await hub().request({ kind: 'diff', path, ...workspaces().ref(workspaceId) });
		} catch (error) {
			return { unavailable: `Could not load the file: ${message(error)}` };
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
