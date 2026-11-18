<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor } from 'storybook/test';
	import type { Block } from '#lib/transcript.ts';
	import MessageView from './MessageView.svelte';
	import Button from '#lib/ui/Button.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Message view', component: MessageView });
	const history: Block[] = Array.from({ length: 500 }, (_, index) =>
		index % 2 === 0
			? { kind: 'user', text: `Message ${index}` }
			: {
					kind: 'agent',
					parts: [
						{
							kind: 'text',
							text: `Reply ${index}\n\n${'Some longer output. '.repeat((index % 11) + 1)}`
						}
					]
				}
	);
</script>

<script lang="ts">
	let blocks = $state<Block[]>(history);
	let queue = $state(['Please check the tests.']);
	let following = $state(true);
	let conversation = $state(0);
	let view = $state<MessageView>();
</script>

<Story
	name="Long conversation"
	asChild
	play={async ({ canvasElement, canvas }) => {
		const scroller = canvasElement.querySelector('.scroller') as HTMLElement;
		const bottom = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
		await waitFor(() => expect(canvas.getByText('Please check the tests.')).toBeVisible());
		await waitFor(() => expect(bottom()).toBeLessThan(2));
		expect(canvasElement.querySelectorAll('li').length).toBeLessThan(50);
		await userEvent.click(canvas.getByRole('button', { name: 'Append reply' }));
		await waitFor(() => expect(canvas.getByText('Please check the tests.')).toBeVisible());
		await waitFor(() => expect(bottom()).toBeLessThan(2));
		await userEvent.click(canvas.getByRole('button', { name: 'Grow reply' }));
		await waitFor(() => expect(canvas.getByText('Please check the tests.')).toBeVisible());
		await waitFor(() => expect(bottom()).toBeLessThan(2));
		scroller.scrollTop = 0;
		await waitFor(() => expect(canvas.getByText('Reading history')).toBeVisible());
		await waitFor(() => expect(canvas.getByText('Message 0')).toBeVisible());
		await userEvent.click(canvas.getByRole('button', { name: 'Append reply' }));
		await waitFor(() => expect(scroller.scrollTop).toBe(0));
		await userEvent.click(canvas.getByRole('button', { name: 'Jump to latest' }));
		await waitFor(() => expect(canvas.getByText('Please check the tests.')).toBeVisible());
		await waitFor(() => expect(bottom()).toBeLessThan(2));
		const remove = canvas.getByRole('button', { name: "Don't send this" });
		await waitFor(() => expect(getComputedStyle(remove).pointerEvents).not.toBe('none'));
		await userEvent.click(remove);
		await waitFor(() => expect(canvas.queryByText('Please check the tests.')).toBeNull());
		scroller.scrollTop = 0;
		await waitFor(() => expect(canvas.getByText('Reading history')).toBeVisible());
		await userEvent.click(canvas.getByRole('button', { name: 'Switch workspace' }));
		await waitFor(() => expect(canvas.getByText('Following')).toBeVisible());
		await waitFor(() => {
			const next = canvasElement.querySelector('.scroller') as HTMLElement;
			expect(next.scrollTop).toBeGreaterThan(0);
			expect(next.scrollHeight - next.clientHeight - next.scrollTop).toBeLessThan(2);
		});
	}}
>
	<div class="space-y-3">
		<div class="flex gap-2">
			<Button
				onclick={() =>
					(blocks = [...blocks, { kind: 'agent', parts: [{ kind: 'text', text: 'New reply' }] }])}
				>Append reply</Button
			>
			<Button
				onclick={() =>
					(blocks = [
						...blocks.slice(0, -1),
						{ kind: 'agent', parts: [{ kind: 'text', text: 'Growing output.\n\n'.repeat(40) }] }
					])}>Grow reply</Button
			>
			<Button onclick={() => view?.toLatest()}>Jump to latest</Button>
			<Button onclick={() => conversation++}>Switch workspace</Button>
			<span>{following ? 'Following' : 'Reading history'}</span>
		</div>
		<div class="flex h-96 flex-col overflow-hidden card">
			{#key conversation}
				<MessageView
					bind:this={view}
					bind:following
					{blocks}
					{queue}
					agent="codex"
					onremove={(index) => (queue = queue.filter((_, i) => i !== index))}
				/>
			{/key}
		</div>
	</div>
</Story>

<Story name="Empty" asChild>
	<div class="flex h-80 flex-col overflow-hidden card">
		<MessageView blocks={[]} agent="claude" onremove={() => {}} />
	</div>
</Story>

<!-- A picture the agent refers to is asked of the workspace; one that cannot be had leaves its path. -->
<Story
	name="Picture that cannot be had"
	asChild
	play={async ({ canvasElement, canvas }) => {
		await waitFor(() => expect(canvas.getByText('shots/sidebar.png')).toBeVisible());
		expect(canvasElement.querySelector('img[data-picture]')).toBeNull();
	}}
>
	<div class="flex h-80 flex-col overflow-hidden card">
		<MessageView
			blocks={[
				{
					kind: 'agent',
					parts: [
						{
							kind: 'text',
							text: 'The sidebar now looks like this:\n\n![The sidebar](shots/sidebar.png)'
						}
					]
				}
			]}
			agent="claude"
			pictures="/no-such-workspace/picture"
			onremove={() => {}}
		/>
	</div>
</Story>

<Story
	name="Copy messages"
	asChild
	play={async ({ canvas }) => {
		const user = userEvent.setup();
		const buttons = await canvas.findAllByRole('button', { name: 'Copy message' });
		for (const [index, text] of ['First line\nSecond line', '**Done**', 'Queued text'].entries()) {
			await user.click(buttons[index]);
			await expect(await navigator.clipboard.readText()).toBe(text);
			await expect(buttons[index]).toHaveAccessibleName('Copied');
		}
	}}
>
	<div class="flex h-96 flex-col overflow-hidden card">
		<MessageView
			blocks={[
				{ kind: 'user', text: 'First line\nSecond line' },
				{ kind: 'agent', parts: [{ kind: 'text', text: '**Done**' }] }
			]}
			queue={['Queued text']}
			agent="codex"
			onremove={() => {}}
		/>
	</div>
</Story>
