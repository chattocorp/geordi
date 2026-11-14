/**
 * The tab being dragged right now, if any: which `Panes` it came from, and which one it is
 * over. Shared, so that a tab can be dropped on another `Panes` than the one it was picked
 * up in.
 */
export const drag = $state<{ tab: string | null; source: symbol | null; over: symbol | null }>({
	tab: null,
	source: null,
	over: null
});

export function endDrag() {
	drag.tab = drag.source = drag.over = null;
}
