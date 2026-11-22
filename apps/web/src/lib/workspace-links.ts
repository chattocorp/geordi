import { getContext, setContext } from 'svelte';

/**
 * Which workspace a branch or pull request named in agent output belongs to, so that
 * `renderMarkdown` can link to it. Only workspaces that are listed (not archived) are found.
 */
export type WorkspaceLinks = {
	/** The workspace on a branch, written as code (`geordi/fix-login`). */
	branch(name: string): string | undefined;
	/** The workspace whose pull request is at this address. */
	pull(url: string): string | undefined;
	/** The workspace whose pull request has this number (`#42`), in the repository on screen. */
	number(number: string): string | undefined;
};

type Listed = {
	id: string;
	repoId: string | null;
	branch: string | null;
	pull: { number: string; url: string | null } | null;
};

/** A pull request's address without what may follow it: a tab (`/files`), an anchor. */
const pullAddress = (url: string) =>
	url
		.replace(/[?#].*$/, '')
		.replace(/\/(files|commits|checks|changes|diffs)$/, '')
		.replace(/\/+$/, '');

/**
 * Looks up `workspaces` by branch and pull request. `here` is the workspace on screen: it is
 * never linked to itself, and its repository is where a bare `#42` and a branch name are
 * looked for first.
 */
export function workspaceLinks(
	workspaces: readonly Listed[],
	here?: string | null
): WorkspaceLinks {
	const others = workspaces.filter((workspace) => workspace.id !== here);
	const repoId = workspaces.find((workspace) => workspace.id === here)?.repoId;
	const local = others.filter((workspace) => repoId && workspace.repoId === repoId);
	return {
		branch(name) {
			const named = (list: Listed[]) => list.filter((workspace) => workspace.branch === name);
			const found = named(local);
			if (found.length) return found[0].id;
			// elsewhere, only where it can only mean one
			const anywhere = named(others);
			return anywhere.length === 1 ? anywhere[0].id : undefined;
		},
		pull(url) {
			const address = pullAddress(url);
			return others.find(
				(workspace) => workspace.pull?.url && pullAddress(workspace.pull.url) === address
			)?.id;
		},
		number(number) {
			return local.find((workspace) => workspace.pull?.number === number)?.id;
		}
	};
}

const KEY = Symbol('workspace links');

/** For everything below: a getter, read when markdown is rendered. */
export const setWorkspaceLinks = (links: () => WorkspaceLinks | undefined) =>
	setContext(KEY, links);

/** Called while a component is set up; the getter it returns, whenever. */
export const workspaceLinksContext = () =>
	getContext<(() => WorkspaceLinks | undefined) | undefined>(KEY);
