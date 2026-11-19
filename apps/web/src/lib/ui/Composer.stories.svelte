<script module lang="ts">
	import { tick } from 'svelte';
	import { expect, fn } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import Composer from './Composer.svelte';
	import Select from './Select.svelte';

	const { Story } = defineMeta({ title: 'UI/Composer', component: Composer });

	const form = { onsubmit: (event: SubmitEvent) => event.preventDefault() };

	let pending = $state(false);
	const replyForm = {
		async onsubmit(event: SubmitEvent) {
			event.preventDefault();
			pending = true;
			await tick();
			pending = false;
		}
	};

	const sentSuggestion = fn<(message: string) => void>();
	const suggestionForm = {
		onsubmit(event: SubmitEvent) {
			event.preventDefault();
			const textarea = (event.currentTarget as HTMLFormElement).querySelector('textarea')!;
			sentSuggestion(textarea.value);
		}
	};

	const longSuggestion =
		'Review the failing tests and find out why the workspace loses its draft after a restart.\n\nFix the cause, add a regression test, and summarize what changed.';

	const commands = [
		{ text: '/review', description: 'Review uncommitted changes', hint: 'optional instructions' },
		{ text: '/compact', description: 'Summarize the conversation to free up context' },
		{ text: '/context', description: 'Show how much of the context is in use' },
		{ text: '/code-review', description: 'Review a pull request', hint: '[level] [target]' },
		{ text: '/status', description: 'Show the session’s configuration and token usage' },
		{ text: '/$skill-creator', description: 'Create or update a skill' }
	];
	// as many as an agent with a few plugins offers
	const many = Array.from({ length: 100 }, (_, i) => ({
		text: `/skill-${String(i + 1).padStart(3, '0')}`,
		description: `What skill number ${i + 1} is for, in a sentence that may well run long`,
		hint: i % 3 ? undefined : '<topic>'
	}));
</script>

<Story name="Prompt" asChild>
	<div class="max-w-2xl">
		<Composer {form} focused rows={5} placeholder="What should the agent do?">
			{#snippet footer()}
				<Button type="submit" variant="primary" icon="icon-[lucide--arrow-up]" class="ml-auto">
					Start workspace
				</Button>
			{/snippet}
		</Composer>
	</div>
</Story>

<!-- Choosing an option puts the cursor back in the text. -->
<Story name="With a picker" asChild>
	<div class="max-w-2xl">
		<Composer {form} placeholder="What should the agent do?">
			{#snippet footer()}
				<Select
					label="Model"
					value="opus"
					options={[
						{ value: 'opus', label: 'Opus' },
						{ value: 'sonnet', label: 'Sonnet' }
					]}
				/>
				<Button type="submit" variant="primary" icon="icon-[lucide--arrow-up]" class="ml-auto">
					Start workspace
				</Button>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story
	name="Reply"
	asChild
	play={async ({ canvas, userEvent }) => {
		const text = canvas.getByRole('textbox');
		await expect(text).toHaveFocus();
		await userEvent.keyboard('First reply{Enter}');
		await expect(text).toHaveFocus();
		await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
		await expect(text).toHaveFocus();
	}}
>
	<div class="max-w-2xl">
		<Composer form={replyForm} focused disabled={pending} rows={2} placeholder="Reply to the agent">
			{#snippet footer()}
				<p class="pl-1 text-xs text-muted">Enter to send, Shift+Enter for a new line</p>
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story name="While the agent works" asChild>
	<div class="max-w-2xl">
		<Composer {form} live rows={2} placeholder="Steer the agent, or queue a message">
			{#snippet footer()}
				<p class="pl-1 text-xs text-muted">Enter to steer, ⌘Enter to queue</p>
				<div class="ml-auto flex items-center gap-2">
					<Button icon="icon-[lucide--square]" label="Stop the agent" />
					<Button type="submit" icon="icon-[lucide--list-plus]">Queue</Button>
					<Button type="submit" variant="primary" icon="icon-[lucide--corner-down-right]">
						Steer
					</Button>
				</div>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story name="While the agent works, tall prompt" args={{ live: true }}>
	{#snippet template(args)}
		<div class="max-w-2xl">
			<Composer {form} live={args.live} rows={6} placeholder="Steer the agent, or queue a message">
				{#snippet footer()}
					<Button
						type="submit"
						variant="primary"
						icon="icon-[lucide--arrow-up]"
						label="Send"
						class="ml-auto"
					/>
				{/snippet}
			</Composer>
		</div>
	{/snippet}
</Story>

<Story name="Busy, with a problem" asChild>
	<div class="max-w-2xl">
		<Composer
			{form}
			rows={2}
			placeholder="The agent is working…"
			disabled
			problems={['Write something first']}
		>
			{#snippet footer()}
				<Button icon="icon-[lucide--square]" class="ml-auto">Stop</Button>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story name="With attachments" asChild>
	<div class="max-w-2xl">
		<Composer {form} placeholder="Describe this image">
			{#snippet attachments()}
				<div class="px-4 py-2">
					<img
						src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
						alt="Screenshot attachment"
						class="size-20 rounded-control bg-sunken object-contain"
					/>
				</div>
			{/snippet}
			{#snippet footer()}
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
</Story>

<!-- A slash at the start offers what the text can begin with; choosing one puts it in. -->
<Story
	name="With commands"
	asChild
	play={async ({ canvas, userEvent }) => {
		const text = canvas.getByRole('combobox');
		await userEvent.type(text, 'hello');
		await expect(canvas.queryByRole('listbox')).toBeNull();
		await userEvent.clear(text);
		await userEvent.type(text, '/rev');
		const options = canvas.getAllByRole('option');
		await expect(options.map((option) => option.textContent?.trim().split(/\s/)[0])).toEqual([
			'/review',
			'/code-review'
		]);
		await userEvent.keyboard('{ArrowDown}{Enter}');
		await expect(text).toHaveValue('/code-review ');
		await expect(canvas.queryByRole('listbox')).toBeNull();
		await userEvent.clear(text);
		await userEvent.type(text, '/c');
		await userEvent.keyboard('{Escape}');
		await expect(canvas.queryByRole('listbox')).toBeNull();
		await userEvent.type(text, 'o');
		await expect(canvas.getAllByRole('option')).toHaveLength(3);
	}}
>
	<div class="max-w-2xl pt-80">
		<Composer {form} rows={2} completions={commands} placeholder="Reply to the agent">
			{#snippet footer()}
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
</Story>

<!-- A hundred of them: the list scrolls, and the one chosen with the arrow keys stays in view. -->
<Story
	name="With many commands"
	asChild
	play={async ({ canvas, userEvent }) => {
		await userEvent.type(canvas.getByRole('combobox'), '/');
		await expect(canvas.getAllByRole('option')).toHaveLength(100);
		await userEvent.keyboard('{ArrowUp}');
		await expect(canvas.getByRole('option', { selected: true })).toHaveTextContent('/skill-100');
	}}
>
	<div class="max-w-2xl pt-80">
		<Composer {form} rows={2} completions={many} placeholder="Reply to the agent">
			{#snippet footer()}
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story name="With a suggestion" asChild>
	<div class="max-w-2xl">
		<Composer
			{form}
			focused
			rows={2}
			placeholder="Reply to the agent"
			suggestion="Run the tests again and fix whatever still fails."
		>
			{#snippet footer()}
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story
	name="Long suggestion"
	asChild
	play={async ({ canvas }) => {
		const send = canvas.getByRole('button', { name: /Review the failing tests/ });
		const words = canvas.getByText(longSuggestion.replace(/\s+/g, ' '));
		await expect(words.textContent).toBe(longSuggestion);
		await expect(words.scrollHeight).toBeLessThanOrEqual(words.clientHeight + 1);
		await expect(words.getBoundingClientRect().right).toBeLessThanOrEqual(
			send.getBoundingClientRect().right
		);
	}}
>
	<div class="max-w-sm">
		<Composer {form} rows={2} placeholder="Reply to the agent" suggestion={longSuggestion}>
			{#snippet footer()}
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
</Story>

<Story
	name="Scrollable suggestion"
	asChild
	play={async ({ canvas }) => {
		const prompt = canvas.getByRole('button', { name: /Review the failing tests/ });
		const send = canvas.getByRole('button', { name: 'Send' });
		const pane = canvas.getByTestId('conversation-pane');
		await expect(canvas.getByRole('textbox').closest('form')).toContainElement(prompt);
		await expect(prompt.scrollHeight).toBeGreaterThan(prompt.clientHeight);
		await expect(send.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			pane.getBoundingClientRect().bottom
		);
		const edit = canvas.getByRole('button', { name: 'Edit suggested reply' });
		const editTop = edit.getBoundingClientRect().top;
		prompt.scrollTop = prompt.scrollHeight;
		await expect(edit.getBoundingClientRect().top).toBe(editTop);
		await expect(prompt.scrollTop + prompt.clientHeight).toBeGreaterThanOrEqual(
			prompt.scrollHeight - 1
		);
		prompt.scrollTop = 0;
	}}
>
	<div data-testid="conversation-pane" class="flex h-64 max-w-sm flex-col">
		<Composer
			{form}
			rows={2}
			placeholder="Reply to the agent"
			suggestion={Array(12).fill(longSuggestion).join('\n\n')}
		>
			{#snippet footer()}
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
</Story>

{#snippet editableSuggestion()}
	<div class="max-w-2xl pt-80">
		<Composer
			form={suggestionForm}
			rows={2}
			completions={commands}
			placeholder="Reply to the agent"
			suggestion="Run the tests again."
		>
			{#snippet footer()}
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					label="Send"
					class="ml-auto"
				/>
			{/snippet}
		</Composer>
	</div>
{/snippet}

<Story
	name="Editing a suggestion with Tab"
	asChild
	play={async ({ canvas, userEvent }) => {
		sentSuggestion.mockClear();
		const text = canvas.getByRole('combobox');
		const offer = () => canvas.queryByRole('button', { name: 'Run the tests again.' });
		await userEvent.click(text);
		await userEvent.tab({ shift: true });
		await expect(canvas.getByRole('button', { name: 'Edit suggested reply' })).toHaveFocus();
		await userEvent.tab();
		await expect(text).toHaveFocus();
		await userEvent.tab();
		await expect(text).toHaveFocus();
		await expect(text).toHaveValue('Run the tests again.');
		await expect(sentSuggestion).not.toHaveBeenCalled();
		await expect(offer()).toBeNull();
		await userEvent.clear(text);
		await expect(offer()).toBeNull();
		await userEvent.type(text, '/rev');
		await expect(offer()).toBeNull();
		await expect(canvas.getAllByRole('option')).toHaveLength(2);
	}}
>
	{@render editableSuggestion()}
</Story>

<Story
	name="Editing a suggestion with the pencil"
	asChild
	play={async ({ canvas, userEvent }) => {
		sentSuggestion.mockClear();
		await userEvent.click(canvas.getByRole('button', { name: 'Edit suggested reply' }));
		const text = canvas.getByRole('combobox');
		await expect(text).toHaveFocus();
		await expect(text).toHaveValue('Run the tests again.');
		await expect(sentSuggestion).not.toHaveBeenCalled();
		await expect(canvas.queryByRole('group', { name: 'Suggested reply' })).toBeNull();
	}}
>
	{@render editableSuggestion()}
</Story>

<Story
	name="Sending a suggestion"
	asChild
	play={async ({ canvas, userEvent }) => {
		sentSuggestion.mockClear();
		await userEvent.click(canvas.getByRole('button', { name: 'Run the tests again.' }));
		await expect(sentSuggestion).toHaveBeenCalledTimes(1);
		await expect(sentSuggestion).toHaveBeenCalledWith('Run the tests again.');
		await expect(canvas.queryByRole('group', { name: 'Suggested reply' })).toBeNull();
	}}
>
	<Composer
		form={suggestionForm}
		placeholder="Reply to the agent"
		suggestion="Run the tests again."
	>
		{#snippet footer()}<Button type="submit">Send</Button>{/snippet}
	</Composer>
</Story>

<Story
	name="Repository files"
	asChild
	play={async ({ canvas, userEvent }) => {
		const text = canvas.getByRole('combobox');
		await userEvent.type(text, 'Review @compose');
		const option = await canvas.findByRole('option', { name: 'src/ui/Composer.svelte' });
		await expect(option.querySelector('mark')).toHaveTextContent('Compose');
		await expect(
			canvas.getByRole('option', { name: 'src/workspace/components/Composer.svelte' })
		).toBeVisible();
		await userEvent.keyboard('{Enter}');
		await expect(text).toHaveValue('Review @src/ui/Composer.svelte ');
		await userEvent.clear(text);
		await userEvent.type(text, '@ui/Composer.');
		await expect(
			Array.from(
				canvas.getByRole('option', { name: 'src/ui/Composer.svelte' }).querySelectorAll('mark'),
				(mark) => mark.textContent
			)
		).toEqual(['Composer.', 'ui']);
		await userEvent.clear(text);
		await userEvent.type(text, 'Check @comp next');
		await userEvent.keyboard('{ArrowLeft>5/}');
		await canvas.findByRole('listbox', { name: 'Repository files' });
		await userEvent.keyboard('{Tab}');
		await expect(text).toHaveValue('Check @src/ui/Composer.svelte next');
	}}
>
	<div class="mx-auto mt-64 max-w-2xl">
		<Composer
			{form}
			placeholder="Reply to the agent"
			files={async () => [
				'src/ui/Composer.svelte',
				'src/ui/Composer.stories.svelte',
				'src/components/MessageComposer.svelte',
				'src/workspace/components/Composer.svelte'
			]}
		>
			{#snippet footer()}<Button type="submit" variant="primary" class="ml-auto">Send</Button
				>{/snippet}
		</Composer>
	</div>
</Story>
