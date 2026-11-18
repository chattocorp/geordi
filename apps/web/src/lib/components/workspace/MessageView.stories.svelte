<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor } from 'storybook/test';
	import { subagentBlocks, type Block } from '#lib/transcript.ts';
	import MessageView from './MessageView.svelte';
	import Button from '#lib/ui/Button.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Message view', component: MessageView });
	const openReviewer = fn();
	const openParent = fn();
	const prompt = 'Can you **summarize the changes** at https://example.com/review?';
	const reply =
		'The clipboard icon now sits **below each message**. It copies the original text, including line breaks and Markdown.';
	const queued = 'Please add a screenshot to [the review](https://example.com/review).';
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
	let working = $state(true);
	let planFinished = $state(false);
	let blocks = $state<Block[]>(history);
	let queue = $state(['Please check the tests.']);
	let following = $state(true);
	let conversation = $state(0);
	let view = $state<MessageView>();

	const asked = [
		{
			question: 'Which database should the tests run against?',
			header: 'Database',
			options: [
				{ label: 'SQLite', description: 'In memory: fast, and nothing to set up' },
				{ label: 'Postgres', description: 'What production runs on' }
			],
			multiSelect: false
		}
	];
	let answers = $state<string[] | null>(null);
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
					onanswer={() => {}}
				/>
			{/key}
		</div>
	</div>
</Story>

<Story
	name="Message line breaks"
	asChild
	play={async ({ canvasElement }) => {
		await waitFor(() => expect(canvasElement.querySelectorAll('p br')).toHaveLength(2));
	}}
>
	<div class="flex h-80 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			blocks={[
				{
					kind: 'user',
					text: "No, that's worse...\n\n[ Create account ]\n[ Sign in to existing account ]\nCancel"
				}
			]}
			agent="codex"
			onremove={() => {}}
			onanswer={() => {}}
		/>
	</div>
</Story>

<Story name="Bullet list" asChild>
	<div class="flex h-80 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			blocks={[
				{
					kind: 'user',
					text: 'The pull request tab should show three things:\n\n- The pull request title\n\n- Its description and review status\n\n- The latest checks'
				}
			]}
			agent="codex"
			onremove={() => {}}
			onanswer={() => {}}
		/>
	</div>
</Story>

<Story name="Empty" asChild>
	<div class="flex h-80 flex-col overflow-hidden card">
		<MessageView blocks={[]} agent="claude" onremove={() => {}} onanswer={() => {}} />
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
			onanswer={() => {}}
		/>
	</div>
</Story>

<!-- The agent asks, and waits: answered with one of what it offers, or in one's own words. -->
<Story
	name="Question"
	asChild
	play={async ({ canvas }) => {
		const answer = await canvas.findByRole('button', { name: 'Answer' });
		await expect(answer).toBeDisabled(); // nothing to say yet
		// The virtual list pauses pointer input while it scrolls to the question or its answer.
		const postgres = canvas.getByRole('button', { name: /Postgres/ });
		await waitFor(() => userEvent.click(postgres));
		await waitFor(() => userEvent.click(answer));
		await waitFor(() => expect(canvas.queryByRole('button', { name: 'Answer' })).toBeNull());
		await expect(canvas.getByText('Postgres')).toBeVisible();
	}}
>
	<div class="flex h-96 flex-col overflow-hidden card">
		<MessageView
			blocks={[
				{ kind: 'user', text: 'Make the tests faster' },
				{
					kind: 'agent',
					parts: [
						{ kind: 'text', text: 'Most of the time goes into the database.' },
						{ kind: 'question', id: 'q1', questions: asked, answers, open: !answers }
					]
				}
			]}
			agent="claude"
			running
			onremove={() => {}}
			onanswer={(_, given) => (answers = given)}
		/>
	</div>
</Story>

<Story
	name="Copy messages"
	asChild
	play={async ({ canvas }) => {
		await expect(
			await canvas.findByRole('link', { name: 'https://example.com/review' })
		).toHaveAttribute('href', 'https://example.com/review');
		await expect(canvas.getByRole('link', { name: 'the review' })).toHaveAttribute(
			'href',
			'https://example.com/review'
		);
		const user = userEvent.setup();
		const buttons = await canvas.findAllByRole('button', { name: 'Copy message' });
		for (const [index, text] of [prompt, reply, queued].entries()) {
			await user.click(buttons[index]);
			await expect(await navigator.clipboard.readText()).toBe(text);
			await expect(buttons[index]).toHaveAccessibleName('Copied');
		}
	}}
>
	<div class="flex h-112 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			blocks={[
				{ kind: 'user', text: prompt },
				{ kind: 'agent', parts: [{ kind: 'text', text: reply }] }
			]}
			queue={[queued]}
			agent="codex"
			onremove={() => {}}
			onanswer={() => {}}
		/>
	</div>
</Story>

<Story
	name="Inspect a finished turn"
	asChild
	play={async ({ canvas }) => {
		const progress = 'I’ll check the changes.';
		await waitFor(() => expect(canvas.getByText(progress)).toBeVisible());
		await userEvent.click(canvas.getByRole('button', { name: 'Finish turn' }));
		const activity = await canvas.findByRole('button', {
			name: /Turn activity.*1 message.*1 tool call/
		});
		await expect(canvas.queryByText(progress)).toBeNull();
		await expect(canvas.getByText('The checks passed.')).toBeVisible();
		await userEvent.click(activity);
		await expect(canvas.getByText(progress)).toBeVisible();
		await expect(canvas.getByText('Tools')).toBeVisible();
		await userEvent.keyboard('{Enter}');
		await expect(canvas.queryByText(progress)).toBeNull();
	}}
>
	<div class="space-y-3">
		<Button onclick={() => (working = false)}>Finish turn</Button>
		<div class="flex h-96 flex-col sheet overflow-hidden">
			<MessageView
				blocks={[
					{
						kind: 'agent',
						parts: [
							{ kind: 'text', text: 'I’ll check the changes.' },
							{
								kind: 'tools',
								tools: [
									{
										kind: 'tool',
										id: '1',
										name: 'shell',
										input: 'pnpm check',
										output: 'OK',
										isError: false,
										at: '2026-11-18T12:00:00Z'
									}
								]
							},
							{ kind: 'text', text: 'The checks passed.' }
						]
					}
				]}
				agent="codex"
				running={working}
				onremove={() => {}}
				onanswer={() => {}}
			/>
		</div>
	</div>
</Story>

<Story name="Live plan" asChild>
	<div class="flex h-80 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			agent="codex"
			running
			onremove={() => {}}
			onanswer={() => {}}
			blocks={[
				{
					kind: 'user',
					text: 'Check that the workspace restores its conversation after a restart.'
				},
				{
					kind: 'agent',
					parts: [
						{
							kind: 'plan',
							id: 'tasks',
							plan: {
								type: 'items',
								entries: [
									{ content: 'Trace how the conversation is stored', status: 'completed' },
									{ content: 'Restart the forge during a turn', status: 'in_progress' },
									{ content: 'Compare the restored conversation', status: 'pending' }
								]
							}
						}
					]
				}
			]}
		/>
	</div>
</Story>

<Story
	name="Complete a plan"
	asChild
	play={async ({ canvas, canvasElement }) => {
		const card = await canvas.findByText('Plan');
		const details = card.closest('details');
		await expect(details).toHaveAttribute('open');
		await expect(canvasElement.querySelector('[aria-current="step"]')).toHaveTextContent(
			'Verify replay'
		);
		await userEvent.click(canvas.getByRole('button', { name: 'Complete step' }));
		await expect(await canvas.findByText('Plan complete')).toBeVisible();
		await expect(details).not.toHaveAttribute('open');
		await userEvent.click(canvas.getByText('Plan complete'));
		await expect(details).toHaveAttribute('open');
		await expect(canvas.getByText('Verify replay')).toBeVisible();
	}}
>
	<div class="space-y-3">
		<Button onclick={() => (planFinished = true)}>Complete step</Button>
		<div class="flex h-80 max-w-3xl flex-col sheet overflow-hidden">
			<MessageView
				agent="claude"
				running
				onremove={() => {}}
				onanswer={() => {}}
				blocks={[
					{
						kind: 'agent',
						parts: [
							{
								kind: 'plan',
								id: 'tasks',
								plan: {
									type: 'items',
									entries: [
										{ content: 'Verify replay', status: planFinished ? 'completed' : 'in_progress' }
									]
								}
							}
						]
					}
				]}
			/>
		</div>
	</div>
</Story>

<Story
	name="Native reviewers"
	asChild
	play={async ({ canvas }) => {
		openReviewer.mockClear();
		await userEvent.click(await canvas.findByText('Review UI and design'));
		await expect(
			await canvas.findByText('The focus indicator is visible on every tab.')
		).toBeVisible();
		await expect(canvas.getByText('Running')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Open in tab' }));
		await expect(openReviewer).toHaveBeenCalledWith('ui');
	}}
>
	<div class="flex h-112 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			agent="claude"
			onopensubagent={openReviewer}
			onremove={() => {}}
			onanswer={() => {}}
			blocks={[
				{ kind: 'user', text: 'Review the daemon and the conversation UI.' },
				{
					kind: 'agent',
					parts: [
						{
							kind: 'subagent',
							id: 'daemon',
							at: '',
							title: 'Review daemon and backend',
							state: 'running',
							items: []
						},
						{
							kind: 'subagent',
							id: 'ui',
							at: '',
							title: 'Review UI and design',
							state: 'done',
							items: [
								{
									kind: 'message',
									id: 'assignment',
									incoming: true,
									text: 'Check keyboard navigation in the conversation tabs.'
								},
								{
									kind: 'tool',
									id: 'read',
									name: 'Read',
									input: '{"file_path":"Panes.svelte"}',
									output: '',
									isError: false,
									at: ''
								},
								{
									kind: 'message',
									id: 'report',
									incoming: false,
									text: 'The focus indicator is visible on every tab.'
								}
							]
						},
						{
							kind: 'text',
							text: 'The UI review is in. The daemon reviewer is still checking reconnects.'
						}
					]
				}
			]}
		/>
	</div>
</Story>

<Story
	name="Subagent conversation tab"
	asChild
	play={async ({ canvas }) => {
		openParent.mockClear();
		const parent = await canvas.findByRole('button', { name: 'Assigned by Backend reviewer' });
		await userEvent.click(parent);
		await expect(openParent).toHaveBeenCalledOnce();
		await expect(
			canvas.getByText('The daemon restores both reviewers after reconnect.')
		).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: /Turn activity/ }));
		await expect(canvas.getByText('Tools')).toBeVisible();
	}}
>
	<div class="flex h-96 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			agent="claude"
			parentAgent={{ name: 'Backend reviewer', open: openParent }}
			blocks={subagentBlocks({
				kind: 'subagent',
				id: 'daemon',
				title: 'Review daemon reconnects',
				state: 'done',
				at: '',
				items: [
					{
						kind: 'message',
						id: 'assignment',
						incoming: true,
						text: 'Check that reviewers survive a daemon reconnect.'
					},
					{
						kind: 'tool',
						id: 'read',
						name: 'Read',
						input: 'session.ts',
						output: '',
						at: '',
						isError: false
					},
					{
						kind: 'message',
						id: 'report',
						incoming: false,
						text: 'The daemon restores both reviewers after reconnect.'
					}
				]
			})}
		/>
	</div>
</Story>

<Story name="External agent follow-up" asChild>
	<div class="flex h-80 flex-col overflow-hidden card">
		<MessageView
			blocks={[
				{
					kind: 'user',
					text: 'Please check the migration.',
					from: 'external:example',
					senderName: 'Release assistant'
				}
			]}
			agent="codex"
			onremove={() => {}}
			onanswer={() => {}}
		/>
	</div>
</Story>
