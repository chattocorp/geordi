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
		}
		// interface Platform {}
	}
}

export {};
