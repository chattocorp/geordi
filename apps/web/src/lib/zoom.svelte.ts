import { pushState, replaceState } from '$app/navigation';
import { page } from '$app/state';
import { untrack } from 'svelte';

/**
 * Where an outline is zoomed into (FDR-019), as a step in the page's history: zooming pushes
 * one, so that Back zooms out again and Forward back in (shallow routing: the URL stays the
 * same). `stored` keeps it besides, so that it outlasts going to another page, as what is
 * folded does. `key` tells one outline from another (the sidebar, a workspace's Plan).
 * Call during component setup.
 */
export function zoomInHistory(key: string, stored: { current: string | null }) {
	// Back or forward: zoom as it was there, where that step says
	$effect(() => {
		const zoom = page.state.zoom;
		if (!zoom || !(key in zoom)) return;
		const at = zoom[key] ?? null;
		untrack(() => {
			if (stored.current !== at) stored.current = at;
		});
	});
	return {
		get current() {
			return stored.current;
		},
		set current(id: string | null) {
			if (id === stored.current) return;
			// where it was, for coming back to: the step it is zoomed from says so too
			if (!(key in (page.state.zoom ?? {})))
				replaceState('', { ...page.state, zoom: { ...page.state.zoom, [key]: stored.current } });
			const from = stored.current;
			stored.current = id;
			pushState('', {
				...page.state,
				zoom: { ...page.state.zoom, [key]: id },
				zoomed: { key, from }
			});
		},
		/**
		 * Where it was zoomed into before this step of the history zoomed it to where it is
		 * (`null`: not at all), to go back to with `back`; `undefined` where this step is not its
		 * zoom (another outline zoomed since, or a page opened zoomed in).
		 */
		get from(): string | null | undefined {
			const zoomed = page.state.zoomed;
			return zoomed?.key === key ? zoomed.from : undefined;
		},
		/** Goes back to where it was zoomed into before: a step back in the history. */
		back() {
			history.back();
		}
	};
}
