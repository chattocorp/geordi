<script lang="ts">
	import '@xterm/xterm/css/xterm.css';
	import type { ITheme } from '@xterm/xterm';
	import type { Attachment } from 'svelte/attachments';
	import { resolve } from '$app/paths';
	import { terminalInput, terminalResize } from '../../../routes/workspaces.remote';

	let { workspaceId }: { workspaceId: string } = $props();

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

	const terminal: Attachment<HTMLElement> = (node) => {
		let dispose = () => {};
		let disposed = false;

		// xterm needs a browser, so it is loaded here rather than imported.
		Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(
			([{ Terminal }, { FitAddon }]) => {
				if (disposed) return;

				const term = new Terminal({
					fontFamily: "'Geist Mono Variable', ui-monospace, monospace",
					fontSize: 12.5,
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
				const url = resolve('/workspaces/[id]/terminal', { id: workspaceId });
				const source = new EventSource(`${url}?cols=${term.cols}&rows=${term.rows}`);
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
						await terminalInput({ workspaceId, data }).catch(() => {});
					}
					sending = false;
				}
				term.onData((data) => {
					if (replaying) return;
					pending += data;
					flush();
				});

				term.onResize(({ cols, rows }) => {
					terminalResize({ workspaceId, cols, rows }).catch(() => {});
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

<section class="flex min-h-0 flex-1 flex-col" aria-label="Terminal">
	<header class="flex h-10 shrink-0 items-center border-b border-line bg-sidebar px-3.5">
		<h2 class="text-[13px] font-medium">Terminal</h2>
	</header>
	<div class="min-h-0 flex-1 overflow-hidden py-2 pl-3" {@attach terminal}></div>
</section>
