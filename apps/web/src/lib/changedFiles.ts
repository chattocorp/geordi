import { getContext, setContext } from 'svelte';

/**
 * The files a workspace has changed, for its conversations: code there that names one of
 * them links to its diff (`Markdown.svelte`).
 */
export type ChangedFiles = {
	/** Their paths, in the worktree. */
	readonly paths: ReadonlySet<string>;
	/** Where the worktree is, for absolute paths. */
	readonly root?: string;
	open: (path: string) => void;
};

const KEY = Symbol('changed files');

export const setChangedFiles = (files: ChangedFiles) => setContext(KEY, files);

/** The workspace's changed files; none outside a workspace. */
export const changedFiles = () => getContext<ChangedFiles | undefined>(KEY);
