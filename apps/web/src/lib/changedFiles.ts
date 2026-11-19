import type { ChangedFiles } from '@geordi/ui/tools';
import { getContext, setContext } from 'svelte';

export type { ChangedFiles } from '@geordi/ui/tools';

/**
 * The files a workspace has changed, for its conversations: code there that names one of
 * them links to its diff (`Markdown.svelte`).
 */
const KEY = Symbol('changed files');

export const setChangedFiles = (files: ChangedFiles) => setContext(KEY, files);

/** The workspace's changed files; none outside a workspace. */
export const changedFiles = () => getContext<ChangedFiles | undefined>(KEY);
