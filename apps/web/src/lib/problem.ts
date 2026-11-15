import { isHttpError } from '@sveltejs/kit';

/**
 * What went wrong, in words to show someone. A refusal from the server (`error(409, …)`)
 * arrives as an `HttpError`, which is not an `Error`: its message is in its body.
 */
export const problemOf = (error: unknown, fallback: string): string =>
	isHttpError(error) ? error.body.message : error instanceof Error ? error.message : fallback;
