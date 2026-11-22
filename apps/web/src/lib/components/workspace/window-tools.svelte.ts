import { getContext, setContext } from 'svelte';
import { persisted } from '@geordi/ui/persisted';

/** A way to show a file: as it looks, or as text. */
export type FileMode = { value: string; label: string; icon: string };

/** What can be done with a file a window shows, from the window's tab bar. */
export type FileTools = {
	/** The ways the file can be shown, and the one it is shown in. */
	modes?: { options: FileMode[]; current: string; select(value: string): void };
	/** Its text is on screen (source or a diff), so wrapping long lines does something. */
	wrappable: boolean;
};

/**
 * Called with a file's tools while it is shown, and again whenever they change; returns
 * what undoes it. A value, not a getter: the window may read it while the file is going.
 */
export type OnTools = (tools: FileTools) => () => void;

type WrapLines = { current: boolean };
const key = Symbol('wrap-lines');

/**
 * Whether long lines wrap in a workspace's files and diffs, rather than scroll sideways:
 * a preference of this browser. Call during the workspace's setup.
 */
export const initWrapLines = () => setContext(key, persisted('geordi:wrap-lines', false));

/** Whether long lines wrap; they don't outside a workspace. */
export const getWrapLines = (): WrapLines => getContext<WrapLines>(key) ?? { current: false };
