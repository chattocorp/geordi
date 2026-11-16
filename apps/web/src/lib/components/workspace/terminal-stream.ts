import { resolve } from '$app/paths';

/** What a terminal on screen does with its stream. */
type Follower = {
	/** The stream (re)opened: what follows starts over, with the terminal's recent output. */
	open(): void;
	/** Output: `replay` for what the terminal had put out before. */
	data(data: string, replay: boolean): void;
};

/**
 * The output of a workspace's terminals, all through one connection: a browser has six to
 * a server, and one per terminal (on top of what the page itself holds) would use them up,
 * after which nothing on the page gets through any more. The stream is for the terminals on
 * screen; when one comes or goes, it is opened anew for those there are, and each starts
 * over from its recent output.
 */
class Stream {
	followers = new Map<string, Follower>();
	source: EventSource | undefined;
	pending = false;

	constructor(readonly workspaceId: string) {}

	/** Opens the stream for the terminals there are now, once they have all said so. */
	reopen() {
		if (this.pending) return;
		this.pending = true;
		setTimeout(() => {
			this.pending = false;
			this.source?.close();
			this.source = undefined;
			if (this.followers.size === 0) return void streams.delete(this.workspaceId);

			const names = [...this.followers.keys()].sort().join(',');
			const source = new EventSource(
				`${resolve('/workspaces/[id]/terminals', { id: this.workspaceId })}?names=${names}`
			);
			const pass = (replay: boolean) => (event: MessageEvent<string>) => {
				const { terminal, data } = JSON.parse(event.data) as { terminal: string; data: string };
				this.followers.get(terminal)?.data(data, replay);
			};
			source.onopen = () => this.followers.forEach((follower) => follower.open());
			source.onmessage = pass(false);
			source.addEventListener('replay', pass(true));
			this.source = source;
		});
	}
}

const streams = new Map<string, Stream>();

/** Follows a terminal's output. Returns a function that stops. */
export function follow(workspaceId: string, terminal: string, follower: Follower): () => void {
	let stream = streams.get(workspaceId);
	if (!stream) streams.set(workspaceId, (stream = new Stream(workspaceId)));
	stream.followers.set(terminal, follower);
	stream.reopen();
	return () => {
		if (stream.followers.get(terminal) === follower) stream.followers.delete(terminal);
		stream.reopen();
	};
}
