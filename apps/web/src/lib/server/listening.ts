/**
 * What a server of the forge's own does when it cannot listen. A port that something else
 * holds leaves the forge unable to do its work, so it stops, and says why: whoever started
 * it says so (the desktop app, the `geordi` command). Only a server re-created by a dev-mode
 * module reload, which may find its predecessor's port not yet free, lives with it.
 */
export function onListenError(name: string, port: number, reloaded: boolean) {
	return (error: NodeJS.ErrnoException) => {
		if (error.code !== 'EADDRINUSE' || reloaded) return console.error(`[${name}]`, error.message);
		console.error(`[${name}] Port ${port} is in use by another program.`);
		process.exit(1);
	};
}
