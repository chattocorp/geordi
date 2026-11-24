<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor } from 'storybook/test';
	import { subagentBlocks, type Block } from '#lib/transcript.ts';
	import MessageView from './MessageView.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import Composer from '@geordi/ui/Composer.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Message view', component: MessageView });
	const openReviewer = fn();
	const openParent = fn();
	const openTurn = fn();
	const changes = {
		files: [{ path: 'src/format.ts', operation: 'modify' }],
		added: 1,
		removed: 1,
		patch:
			'diff --git a/src/format.ts b/src/format.ts\n--- a/src/format.ts\n+++ b/src/format.ts\n@@ -1 +1 @@\n-export const label = name;\n+export const label = name.trim();\n'
	};
	const stopBackground = fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
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
	let questionTarget = $state<{ id: string; done(): void }>();
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
			>
				Append reply
			</Button>
			<Button
				onclick={() =>
					(blocks = [
						...blocks.slice(0, -1),
						{ kind: 'agent', parts: [{ kind: 'text', text: 'Growing output.\n\n'.repeat(40) }] }
					])}
			>
				Grow reply
			</Button>
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

<!--
	Where a reply ends, how long it took, with what it used on hover: beside its last words, or
	on its own after a tool call. Earlier replies say it when the pointer is on them.
-->
<Story
	name="Byline"
	asChild
	play={async ({ canvas }) => {
		await waitFor(() => expect(canvas.getByText('48s')).toBeVisible());
		expect(canvas.getByText('12 minutes ago')).toBeVisible();
		expect(canvas.getByText('8 days ago')).toBeInTheDocument();
		expect(canvas.getByText('2m 14s')).toBeInTheDocument();
		const tokens = canvas.getByText('79k tokens');
		expect(tokens).not.toBeVisible();
		// the tip shows on hover, and on focus for keyboards
		canvas.getByText('48s').focus();
		await waitFor(() => expect(tokens).toBeVisible());
		expect(canvas.getByText('20,224 input · 116 output · 59,136 cache read')).toBeInTheDocument();
	}}
>
	<div class="flex h-120 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			blocks={[
				{ kind: 'user', text: 'What changed?' },
				{
					kind: 'agent',
					parts: [{ kind: 'text', text: reply }],
					endedAt: new Date(Date.now() - 8 * 86_400_000 - 30_000).toISOString(),
					took: 134_000,
					usage: {
						totalTokens: 150330,
						inputTokens: 8,
						outputTokens: 353,
						cachedReadTokens: 120465,
						cachedWriteTokens: 29504
					}
				},
				{ kind: 'user', text: 'Run the tests.' },
				{
					kind: 'agent',
					parts: [
						{
							kind: 'tools',
							tools: [
								{
									kind: 'tool',
									id: 'test',
									name: 'Bash',
									input: '{"command":"pnpm test"}',
									output: 'All tests passed.',
									isError: false,
									at: '2026-11-18T12:00:00Z'
								}
							]
						}
					],
					endedAt: new Date(Date.now() - 12 * 60_000 - 30_000).toISOString(),
					took: 48_000,
					usage: {
						totalTokens: 79476,
						inputTokens: 20224,
						outputTokens: 116,
						cachedReadTokens: 59136
					}
				}
			]}
			agent="claude"
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

<!-- A plain-text data URL makes the browser reject the image without waiting for the test server. -->
<Story
	name="Picture that cannot be had"
	asChild
	play={async ({ canvasElement, canvas }) => {
		// The browser can defer lazy images in a background test iframe. Request this
		// missing image as soon as the virtualized row mounts so its error is exercised.
		await canvas.findByText('The sidebar now looks like this:');
		const picture = canvasElement.querySelector<HTMLImageElement>('img[data-picture]');
		if (picture) picture.loading = 'eager';
		await expect(await canvas.findByText('shots/sidebar.png')).toBeVisible();
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
			pictures="data:text/plain,Picture unavailable"
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

<Story name="Compacting" asChild>
	<div class="flex h-80 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			agent="claude"
			running
			onremove={() => {}}
			onanswer={() => {}}
			blocks={[
				{ kind: 'user', text: 'Keep going with the login fix.' },
				{ kind: 'agent', parts: [{ kind: 'text', text: 'Running the tests once more.' }] },
				{ kind: 'note', text: 'Compacted the conversation, 183k → 21k tokens' },
				{ kind: 'agent', parts: [{ kind: 'text', text: 'All green. On to the redirect.' }] },
				{ kind: 'note', text: 'Compacting the conversation', working: true }
			]}
		/>
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
		const reviewer = await canvas.findByText('Review UI and design');
		// The virtual list pauses pointer input while it scrolls, including after expansion.
		await waitFor(() => userEvent.click(reviewer));
		await expect(
			await canvas.findByText('The focus indicator is visible on every tab.')
		).toBeVisible();
		const status = canvas.getByText('Running');
		const dots = status.querySelector('[role="img"]')!.getBoundingClientRect();
		const label = status.getBoundingClientRect();
		await expect(
			Math.abs(dots.top + dots.height / 2 - (label.top + label.height / 2))
		).toBeLessThan(1);
		const open = canvas.getByRole('button', { name: 'Open in tab' });
		await expect(open).toHaveAttribute('title', 'Open in tab');
		await expect(open).toHaveTextContent(/^$/);
		await waitFor(() => userEvent.click(open));
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

<Story
	name="Agent follow-ups"
	asChild
	play={async ({ canvas }) => {
		for (const [name, id] of [
			['Simplify release CI', 'parent'],
			['Review', 'peer']
		]) {
			await expect(await canvas.findByRole('link', { name })).toHaveAttribute(
				'href',
				`/workspaces/${id}?agent=${id}`
			);
		}
		await expect(canvas.getByText('From Release assistant').closest('a')).toBeNull();
	}}
>
	<div class="flex h-80 flex-col overflow-hidden card">
		<MessageView
			blocks={[
				{
					kind: 'user',
					text: 'Please check the release.',
					from: 'parent'
				},
				{ kind: 'user', text: 'The review is ready.', from: 'peer', senderName: 'Review' },
				{
					kind: 'user',
					text: 'Please check the migration.',
					from: 'external:example',
					senderName: 'Release assistant'
				}
			]}
			senders={{ parent: 'Simplify release CI' }}
			agent="codex"
			onremove={() => {}}
			onanswer={() => {}}
		/>
	</div>
</Story>

<Story
	name="Background tasks"
	asChild
	play={async ({ canvas }) => {
		const heading = await canvas.findByText('Background tasks');
		await expect(canvas.queryByRole('img', { name: 'Running' })).toBeNull();
		await expect(canvas.queryByRole('button', { name: /pnpm test/ })).toBeNull();
		await userEvent.hover(heading);
		await expect(heading.closest('summary')).toHaveStyle('background-color: rgba(0, 0, 0, 0)');
		await userEvent.click(heading);
		await expect(await canvas.findByText('pnpm dev', { exact: true })).toBeVisible();
		const testTask = await canvas.findByRole('button', { name: 'pnpm test Terminal' });
		await expect(
			await canvas.findByRole('button', { name: 'Review changes Subagent' })
		).toBeVisible();
		const stop = await canvas.findByRole('button', { name: 'Stop pnpm test' });
		await expect(stop).toHaveTextContent(/^$/);
		await userEvent.click(stop);
		await expect(stopBackground).toHaveBeenCalledWith('stop-tests');
		await userEvent.click(testTask);
		await expect(await canvas.findByRole('button', { name: /Turn activity/ })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		await waitFor(() =>
			expect(testTask.ownerDocument.activeElement?.closest('details')).toHaveAttribute('open')
		);
	}}
>
	<div class="mx-auto flex h-144 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			agent="codex"
			withComposer
			onopensubagent={openReviewer}
			onstoptask={stopBackground}
			background={[
				{ type: 'tool_call', id: 'tests', toolCallId: 'tests', stopId: 'stop-tests' },
				{ type: 'subagent', id: 'review', stopId: 'stop-review' },
				{ type: 'terminal', id: 'dev', label: 'pnpm dev', stopId: 'stop-dev' }
			]}
			blocks={[
				{ kind: 'user', text: 'Run the tests and review the changes.' },
				{
					kind: 'agent',
					parts: [
						{
							kind: 'tools',
							tools: [
								{
									kind: 'tool',
									id: 'tests',
									name: 'Shell',
									input: 'pnpm test',
									output: null,
									isError: false,
									at: ''
								}
							]
						},
						{
							kind: 'subagent',
							id: 'review',
							title: 'Review changes',
							at: '',
							items: [],
							state: 'running'
						},
						{ kind: 'text', text: 'The tests and review are running in the background.' }
					]
				}
			]}
		/>
		<div class="relative px-5 pb-5">
			<Composer
				form={{ onsubmit: (event) => event.preventDefault() }}
				rows={2}
				placeholder="Reply to the agent"
			>
				{#snippet footer()}<Button
						type="submit"
						variant="primary"
						icon="icon-[lucide--arrow-up]"
						label="Send"
						class="ml-auto"
					/>{/snippet}
			</Composer>
		</div>
	</div>
</Story>

<Story
	name="Completed turn changes"
	asChild
	play={async ({ canvas, userEvent }) => {
		const summary = await canvas.findByRole('button', { name: /1 file changed/ });
		await userEvent.click(summary);
		await expect(openTurn).toHaveBeenCalledWith({ number: 1, diff: changes });
	}}
>
	<div class="flex h-80 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			agent="codex"
			onopenturn={openTurn}
			blocks={[
				{ kind: 'user', text: 'Trim whitespace from display names.' },
				{
					kind: 'agent',
					parts: [{ kind: 'text', text: 'Display names now use the trimmed value.' }],
					changes: { number: 1, diff: changes },
					took: 18000
				}
			]}
		/>
	</div>
</Story>

<Story
	name="Open a question in earlier activity"
	asChild
	play={async ({ canvas }) => {
		// A virtual row can stay hidden for measurement after its controls mount.
		const conversation = canvas.getByRole('list');
		conversation.style.visibility = 'hidden';
		await userEvent.click(canvas.getByRole('button', { name: 'Open question' }));
		await waitFor(() => expect(canvas.getByText('SQLite')).toBeInTheDocument());
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		conversation.style.removeProperty('visibility');
		await waitFor(() => expect(canvas.getByRole('button', { name: /SQLite/ })).toHaveFocus());
	}}
>
	<button
		type="button"
		onclick={() => (questionTarget = { id: 'q1', done: () => (questionTarget = undefined) })}
	>
		Open question
	</button>
	<div class="flex h-96 flex-col overflow-hidden card">
		<MessageView
			blocks={[
				{
					kind: 'agent',
					parts: [
						{ kind: 'question', id: 'q1', questions: asked, answers: null, open: true },
						{ kind: 'text', text: 'Waiting for your choice.' }
					]
				},
				...history
			]}
			agent="claude"
			{questionTarget}
			onanswer={() => {}}
		/>
	</div>
</Story>

<Story
	name="Posted image attachments"
	asChild
	play={async ({ canvas }) => {
		const button = await canvas.findByRole('button', { name: 'Open image 2' });
		const src = button.querySelector('img')!.src;
		await userEvent.click(button);
		const dialog = await canvas.findByRole('dialog', { name: 'Attached image 2' });
		expect(dialog.querySelector('img')!.src).toBe(src);
		// Right after it opens, the dialog sometimes reports `pointer-events: none` for a moment
		// (seen in CI, not in a browser), which user-event refuses to click through; and it can
		// flip back between a check and the click. So the click itself is what is retried.
		await waitFor(() => userEvent.click(dialog));
		await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
	}}
>
	<div class="flex h-80 max-w-3xl flex-col sheet overflow-hidden">
		<MessageView
			blocks={[
				{
					kind: 'user',
					text: 'Here are the two icon variants.',
					images: ['opencode-light.svg', 'opencode-dark.svg']
				}
			]}
			agent="codex"
			onremove={() => {}}
			onanswer={() => {}}
		/>
	</div>
</Story>
