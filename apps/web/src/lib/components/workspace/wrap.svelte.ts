import { getContext, setContext } from 'svelte';
import { persisted } from '@geordi/ui/persisted';

type WrapLines = { current: boolean };
const key = Symbol('wrap-lines');

/**
 * Whether long lines wrap in a workspace's files and diffs, rather than scroll sideways:
 * a preference of this browser. Call during the workspace's setup.
 */
export const initWrapLines = () => setContext(key, persisted('geordi:wrap-lines', false));

/** Whether long lines wrap; they don't outside a workspace. */
export const getWrapLines = (): WrapLines => getContext<WrapLines>(key) ?? { current: false };
