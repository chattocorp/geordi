// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** The windows a workspace showed at this step of the history (shallow routing). */
			windows?: { shown: string[]; diffPath?: string };
			/** Where each outline was zoomed into at this step (FDR-019): the sidebar's, a Plan's. */
			zoom?: Record<string, string | null>;
			/** The outline whose zoom this step changed, and where it was zoomed into before: where its back arrow goes. */
			zoomed?: { key: string; from: string | null };
		}
		// interface Platform {}
	}
}

export {};
