<script lang="ts">
	import '@xterm/xterm/css/xterm.css';
	import type { ITheme, Terminal } from '@xterm/xterm';
	import type { Attachment } from 'svelte/attachments';
	import { startTerminal, terminalInput, terminalResize } from '../../../routes/workspaces.remote';
	import { followTerminal } from '#lib/live.svelte.ts';

	type Props = {
		workspaceId: string;
		/** This terminal's name within the workspace. */
		terminal: string;
		/** Whether the user just asked for this terminal: start its shell right away. */
		start: boolean;
		/** Focus the input as soon as it is ready. */
		autofocus?: boolean;
		onautofocus?: () => void;
		ontitle?: (title: string) => void;
	};
	let { workspaceId, terminal, start, autofocus = false, onautofocus, ontitle }: Props = $props();

	let ready = $state.raw<Terminal>();
	$effect(() => {
		if (ready && autofocus) {
			ready.focus();
			onautofocus?.();
		}
	});

	/** xterm paints its own colours; take them from our tokens. */
	function theme(node: HTMLElement): ITheme {
		// from where it stands: what is behind it (`--pane`) depends on the area it is in
		const token = (name: string) => getComputedStyle(node).getPropertyValue(name).trim();
		return {
			background: token('--pane'),
			foreground: token('--ink'),
			cursor: token('--accent'),
			cursorAccent: token('--pane'),
			selectionBackground: `${token('--accent')}55`
		};
	}

	const xterm: Attachment<HTMLElement> = (node) => {
		const at = { workspaceId, terminal };
		let dispose = () => {};
		let disposed = false;

		// xterm needs a browser, so it is loaded here rather than imported.
		Promise.all([
			import('@xterm/xterm'),
			import('@xterm/addon-fit'),
			import('./terminal-links.ts')
		]).then(([{ Terminal }, { FitAddon }, { terminalLinks }]) => {
			if (disposed) return;

			const term = new Terminal({
				// the design system's terminal typeface; xterm wants it spelled out
				fontFamily: getComputedStyle(node).getPropertyValue('--font-terminal'),
				// the design system's small size (`text-xs`, on the element), in pixels
				fontSize: parseFloat(getComputedStyle(node).fontSize),
				cursorBlink: true,
				theme: theme(node)
			});
			const fit = new FitAddon();
			term.loadAddon(fit);
			term.loadAddon(terminalLinks());
			term.onTitleChange((title) => ontitle?.(title.trim()));
			term.open(node);
			fit.fit();
			ready = term;

			// Output: recent scrollback first (again after every reconnect), then live.
			// Old output may contain questions to the terminal (e.g. "what are you?") that
			// were answered long ago; answering them again would type into the shell.
			let replaying = false;
			let unfollow = () => {};
			const watch = () => {
				if (disposed) return;
				unfollow = followTerminal({
					of: workspaceId,
					terminal,
					open: () => term.reset(),
					data(data, replay) {
						if (!replay) return term.write(data);
						replaying = true;
						term.write(data, () => (replaying = false));
					}
				});
			};

			// Input: one request at a time, so keystrokes can't overtake each other.
			let pending = '';
			let sending = false;
			async function flush() {
				if (sending) return;
				sending = true;
				while (pending) {
					const data = pending;
					pending = '';
					await terminalInput({ ...at, data }).catch(() => {});
				}
				sending = false;
			}
			term.onData((data) => {
				if (replaying) return;
				pending += data;
				flush();
			});

			// A shell starts only on request: now, if the user just opened this terminal,
			// or later on a key press. Either way the forge needs to know our size.
			const size = { cols: term.cols, rows: term.rows };
			// Its output is followed once that is said: a terminal that is about to start is not
			// one that isn't running, and should not begin by saying so.
			(start ? startTerminal : terminalResize)({ ...at, ...size })
				.catch(() => {})
				.then(watch);
			term.onResize(({ cols, rows }) => {
				terminalResize({ ...at, cols, rows }).catch(() => {});
			});
			const resized = new ResizeObserver(() => fit.fit());
			resized.observe(node);

			const themed = new MutationObserver(() => (term.options.theme = theme(node)));
			themed.observe(document.documentElement, { attributeFilter: ['class'] });

			dispose = () => {
				unfollow();
				resized.disconnect();
				themed.disconnect();
				ready = undefined;
				term.dispose();
			};
		});

		return () => {
			disposed = true;
			dispose();
		};
	};
</script>

<div class="box-content min-h-0 flex-1 overflow-hidden py-2 pl-3 text-xs" {@attach xterm}></div>
