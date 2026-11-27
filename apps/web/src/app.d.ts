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
		}
		// interface Platform {}
	}
}

export {};
