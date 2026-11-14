import type { ServerInit } from '@sveltejs/kit/hooks';
import { hub } from '#lib/server/app.ts';

/** Start accepting daemon connections as soon as the server starts. */
export const init: ServerInit = () => {
	hub();
};
