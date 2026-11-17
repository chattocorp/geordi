<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Terminal } from '@xterm/xterm';
	import '@xterm/xterm/css/xterm.css';
	import type { Attachment } from 'svelte/attachments';
	import { terminalLinks } from './terminal-links.ts';

	const { Story } = defineMeta({ title: 'Geordi/Terminal links' });
	const terminal: Attachment<HTMLElement> = (node) => {
		const term = new Terminal({ cols: 60, rows: 8 });
		term.loadAddon(terminalLinks());
		term.open(node);
		term.writeln('Local server: http://localhost:20000/');
		term.writeln('Documentation: https://example.com/docs?q=terminal#links');
		term.writeln('Wrapped: https://example.com/a/long/path/that/wraps/across/terminal/lines');
		term.writeln('Click a URL to open it, or drag to select text.');
		term.onData((data) => term.write(data));
		return () => term.dispose();
	};
</script>

<Story name="Clickable URLs" asChild>
	<div {@attach terminal}></div>
</Story>
