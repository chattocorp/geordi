/**
 * The workspace whose conversation someone asked to see and write in (by double-clicking it
 * in the sidebar), until its page takes the request. The page may not be there yet: the
 * first click of the two is still navigating to it.
 */
let asked = $state<string | null>(null);

export const foreground = {
	/** Ask a workspace's page to bring its conversation to the front and focus its reply box. */
	ask(id: string) {
		asked = id;
	},
	/** Whether `id`'s conversation was asked for; taking the request clears it. */
	take(id: string) {
		if (asked !== id) return false;
		asked = null;
		return true;
	}
};
