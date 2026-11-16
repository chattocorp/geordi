<script lang="ts">
	import '@xterm/xterm/css/xterm.css';
	import type { ITheme } from '@xterm/xterm';
	import type { Attachment } from 'svelte/attachments';
	import { resolve } from '$app/paths';
	import { startTerminal, terminalInput, terminalResize } from '../../../routes/workspaces.remote';

	type Props = {
		workspaceId: string;
		/** This terminal's name within the workspace. */
		terminal: string;
		/** Whether the user just asked for this terminal: start its shell right away. */
		start: boolean;
		/** For the run terminal: the run command the user asked for, as they saw it. */
		command?: string;
	};
	let { workspaceId, terminal, start, command }: Props = $props();

	/** xterm paints its own colours; take them from our tokens. */
	function theme(): ITheme {
		const token = (name: string) =>
			getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		return {
			background: token('--bg'),
			foreground: token('--ink'),
			cursor: token('--accent'),
			cursorAccent: token('--bg'),
			selectionBackground: `${token('--accent')}55`
		};
	}

	const xterm: Attachment<HTMLElement> = (node) => {
		const at = { workspaceId, terminal };
		let dispose = () => {};
		let disposed = false;

		// xterm needs a browser, so it is loaded here rather than imported.
		Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(
			([{ Terminal }, { FitAddon }]) => {
				if (disposed) return;

				const term = new Terminal({
					// the design system's terminal typeface; xterm wants it spelled out
					fontFamily: getComputedStyle(node).getPropertyValue('--font-terminal'),
					// the design system's small size (`text-xs`, on the element), in pixels
					fontSize: parseFloat(getComputedStyle(node).fontSize),
					cursorBlink: true,
					theme: theme()
				});
				const fit = new FitAddon();
				term.loadAddon(fit);
				term.open(node);
				fit.fit();

				// Output: recent scrollback first (again after every reconnect), then live.
				// Old output may contain questions to the terminal (e.g. "what are you?") that
				// were answered long ago; answering them again would type into the shell.
				let replaying = false;
				const source = new EventSource(
					resolve('/workspaces/[id]/terminals/[terminal]', { id: workspaceId, terminal })
				);
				source.onopen = () => term.reset();
				source.onmessage = (event) => term.write(JSON.parse(event.data));
				source.addEventListener('replay', (event) => {
					replaying = true;
					term.write(JSON.parse(event.data), () => (replaying = false));
				});

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
				(start
					? startTerminal({ ...at, ...size, command })
					: terminalResize({ ...at, ...size })
				).catch(() => {});
				term.onResize(({ cols, rows }) => {
					terminalResize({ ...at, cols, rows }).catch(() => {});
				});
				const resized = new ResizeObserver(() => fit.fit());
				resized.observe(node);

				const themed = new MutationObserver(() => (term.options.theme = theme()));
				themed.observe(document.documentElement, { attributeFilter: ['class'] });

				dispose = () => {
					source.close();
					resized.disconnect();
					themed.disconnect();
					term.dispose();
				};
			}
		);

		return () => {
			disposed = true;
			dispose();
		};
	};
</script>

<div class="min-h-0 flex-1 overflow-hidden py-2 pl-3 text-xs" {@attach xterm}></div>
