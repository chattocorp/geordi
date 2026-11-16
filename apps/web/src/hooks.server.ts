import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { GEORDI_ALLOWED_HOSTS } from '$app/env/private';
import { hub, liveServer } from '#lib/server/app.ts';

/** Start accepting daemon connections, and browsers' for what is live, as soon as the server starts. */
export const init: ServerInit = () => {
	hub();
	liveServer();
};

/**
 * Geordi has no authentication yet, and anyone who can reach it can run agents on this
 * machine. Only answer to allowed hostnames: this blocks DNS rebinding, where a web page
 * on another domain points its hostname at 127.0.0.1 to talk to the forge.
 */
export const handle: Handle = ({ event, resolve }) => {
	const host = new URL(`http://${event.request.headers.get('host') ?? ''}`).hostname;
	if (!GEORDI_ALLOWED_HOSTS.has(host)) return new Response('Host not allowed', { status: 403 });
	return resolve(event);
};
