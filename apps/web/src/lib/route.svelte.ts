import { page } from '$app/state';

/**
 * A page's own route parameter, also while the page is on its way out.
 *
 * A page stays on screen until the one being navigated to is ready, and meanwhile is handed
 * that one's parameters. Where both routes call theirs the same (`/workspaces/[id]` and
 * another `[id]` route), the page would take the other's value for its own: a workspace's
 * page asking for a workspace by another thing's ID, failing, and taking the navigation with it,
 * after which nothing on the page answers a click. So a page reads its parameter through
 * this: `route` is its own route (as `page.route.id` has it), and what `read` returns
 * counts only while that is the route on screen.
 */
export function ownParam(route: string, read: () => string) {
	let last = read();
	const own = $derived.by(() => {
		if (page.route.id === route) last = read();
		return last;
	});
	return {
		get current() {
			return own;
		}
	};
}
