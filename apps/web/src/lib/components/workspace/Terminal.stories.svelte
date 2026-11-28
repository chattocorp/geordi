<script module lang="ts">
	import { expect, fn, mocked, spyOn, waitFor } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Terminal from './Terminal.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Terminal', component: Terminal });
</script>

<script lang="ts">
	let requested = $state(false);
</script>

<Story
	name="New terminal receives focus"
	asChild
	play={async ({ canvasElement }) => {
		await waitFor(() => {
			const input = canvasElement.querySelector('.xterm-helper-textarea');
			expect(input).not.toBeNull();
			expect(input).toHaveFocus();
		});
	}}
>
	<div class="flex h-64 flex-col bg-bg">
		<Terminal workspaceId="story" terminal="new" autofocus />
	</div>
</Story>

<Story
	name="Existing terminal takes focus on request"
	asChild
	play={async ({ canvasElement, canvas, userEvent }) => {
		const input = await waitFor(() => {
			const input = canvasElement.querySelector('.xterm-helper-textarea');
			expect(input).not.toBeNull();
			expect(input).not.toHaveFocus();
			return input;
		});
		await userEvent.click(canvas.getByRole('button', { name: 'Focus terminal' }));
		await waitFor(() => expect(input).toHaveFocus());
	}}
>
	<div class="flex h-64 flex-col bg-bg">
		<button onclick={() => (requested = true)}>Focus terminal</button>
		<Terminal
			workspaceId="story"
			terminal="existing"
			autofocus={requested}
			onautofocus={() => (requested = false)}
		/>
	</div>
</Story>

<Story
	name="Last row fits after resizing"
	asChild
	play={async ({ canvasElement }) => {
		const pane = canvasElement.querySelector<HTMLElement>('[data-terminal-pane]')!;
		for (const height of [256, 171]) {
			pane.style.height = height + 'px';
			await waitFor(() => {
				const screen = pane.querySelector('.xterm-screen')!.getBoundingClientRect();
				const bounds = pane.getBoundingClientRect();
				expect(screen.height).toBeGreaterThan(0);
				expect(screen.bottom).toBeLessThanOrEqual(bounds.bottom - (screen.top - bounds.top));
			});
		}
	}}
>
	<div data-terminal-pane class="flex h-64 flex-col sheet-quiet">
		<Terminal workspaceId="story" terminal="resized" />
	</div>
</Story>

<Story
	name="Shell sets and clears its title"
	args={{ workspaceId: 'story', terminal: 'titled', ontitle: fn() }}
	beforeEach={async () => {
		const { Terminal: Xterm } = await import('@xterm/xterm');
		const opened = spyOn(Xterm.prototype, 'open');
		return () => opened.mockRestore();
	}}
	play={async ({ args }) => {
		const { Terminal: Xterm } = await import('@xterm/xterm');
		const opened = mocked(Xterm.prototype.open);
		await waitFor(() => expect(opened).toHaveBeenCalled());
		const term = opened.mock.contexts[0] as InstanceType<typeof Xterm>;
		term.write('\x1b]2;Build');
		term.write(' output\x07');
		await waitFor(() => expect(args.ontitle).toHaveBeenLastCalledWith('Build output'));
		term.write('\x1b]0;\x1b\\');
		await waitFor(() => expect(args.ontitle).toHaveBeenLastCalledWith(''));
	}}
/>
