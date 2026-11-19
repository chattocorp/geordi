<script lang="ts" module>
	/** Whether the repository is to be chosen first, when the page for a new workspace is open. */
	const asked = $state({ repo: false });

	/** Asks for the repository picker of the page for a new workspace (Cmd+Shift+N). */
	export const pickRepo = () => (asked.repo = true);
</script>

<script lang="ts">
	import { submitOnEnter } from '@geordi/ui/keys';
	import { draft } from '#lib/drafts.svelte.ts';
	import { persisted } from '#lib/persisted.svelte.ts';
	import Button from '@geordi/ui/Button.svelte';
	import MessageComposer from '#lib/components/MessageComposer.svelte';
	import RepoPicker from './RepoPicker.svelte';
	import { follow } from '#lib/live.svelte.ts';
	import type { Navigation } from '#lib/server/views.ts';
	import { createWorkspace } from '../../../routes/workspaces.remote';
	import HarnessPicker, { resolveChoice, type HarnessChoice } from './HarnessPicker.svelte';

	type Props = {
		/** The repositories to choose from. With just one, there is nothing to choose. */
		repos: { id: string; name: string }[];
		/** The repository picked to begin with; the first one, unless said otherwise. */
		preferred?: string;
		label?: string;
		/** Whether the cursor starts in the text: on the page that is for starting a workspace. */
		focused?: boolean;
		/**
		 * A workspace to start in instead: what is written starts another conversation in it,
		 * with an agent that works in its directory.
		 */
		alongside?: string;
		/** Whether this starts a project (FDR-012): no repository to choose. */
		project?: boolean;
	};
	let { repos, preferred, label, focused = false, alongside, project = false }: Props = $props();

	const fields = createWorkspace.fields;
	const { prompt, images } = fields;
	// Each time this is begun, it is begun empty: the form is one for the whole app, and
	// would otherwise still hold what the workspace before was started with.
	// What was written and not sent yet is still there when one comes back, though: one
	// draft for a new workspace, and one for each workspace to start a conversation in.
	prompt.set('');
	const written = draft(
		() => (alongside ? `alongside:${alongside}` : project ? 'project' : 'new'),
		() => prompt
	);
	// (Starting one goes to it, so the form is not reset: the draft is forgotten here.)
	const form = createWorkspace.enhance(async ({ submit }) => {
		if (await submit()) written.clear();
	});

	/** The repository picked here, if one was; otherwise the preferred one, or the first. */
	let picked = $state<string>();
	const repo = $derived(
		repos.find((repo) => repo.id === picked) ??
			repos.find((repo) => repo.id === preferred) ??
			repos[0]
	);

	// `undefined` until loaded, `null` while no daemon is connected: nothing to choose from
	const offered = follow<Navigation>('navigation');
	const harnesses = $derived(offered.current?.harnesses);
	// The next workspace starts out the way the last one was set up.
	const choice = persisted<HarnessChoice>('geordi:harness', { agent: 'claude', settings: {} });
	const chosen = $derived(harnesses?.length ? resolveChoice(harnesses, choice.current) : null);

	let pickingRepo = $state(false);
	// only where repositories are to be chosen from: on the page for a new workspace
	$effect(() => {
		if (!focused || alongside || project || !asked.repo) return;
		asked.repo = false;
		pickingRepo = repos.length > 1;
	});
</script>

<!-- Where a workspace begins: say what should be done, pick who does it, how, and where. -->
<MessageComposer
	bind:images={written.images}
	imageField={images.as('hidden', '[]')}
	{form}
	disabled={createWorkspace.pending > 0}
	{label}
	{focused}
	rows={alongside ? undefined : 5}
	placeholder={project ? 'What should be done, and where?' : 'What should the agent do?'}
	field={prompt.as('text')}
	onkeydown={(event) => {
		// Enter starts the workspace, but not while there is no daemon to run it
		if (chosen) submitOnEnter(event);
		else if (event.key === 'Enter' && !event.shiftKey) event.preventDefault();
	}}
	problems={[...(prompt.issues() ?? []), ...(images.issues() ?? [])].map(
		(problem) => problem.message
	)}
>
	{#snippet header()}
		<input {...fields.repoId.as('hidden', project ? '' : (repo?.id ?? ''))} />
		{#if alongside}<input {...fields.alongside.as('hidden', alongside)} />{/if}
		{#if chosen}
			<input {...fields.agent.as('hidden', chosen.harness.agent)} />
			<input {...fields.model.as('hidden', chosen.model?.id ?? '')} />
			<input {...fields.effort.as('hidden', chosen.effort ?? '')} />
			<input {...fields.permissionMode.as('hidden', chosen.permissionMode)} />
		{/if}
	{/snippet}
	{#snippet footer()}
		<div class="flex min-w-0 flex-wrap items-center gap-1">
			{#if repos.length > 1 && !project}
				<RepoPicker
					{repos}
					bind:open={pickingRepo}
					bind:value={() => repo.id, (id) => (picked = id)}
				/>
			{/if}
			{#if harnesses?.length}
				<HarnessPicker
					{harnesses}
					choice={choice.current}
					onchange={(next) => (choice.current = next)}
				/>
			{:else if harnesses === null}
				<!-- agents run on a daemon: without one there is nobody to choose -->
				<span class="flex h-8 items-center gap-1.5 px-2 text-sm text-muted">
					<span class="icon-[lucide--unplug] size-3.5"></span>
					Waiting for the daemon
				</span>
			{/if}
		</div>
		{#if alongside}
			<!-- a conversation like the others there: sent as they are -->
			<Button
				type="submit"
				variant="primary"
				icon="icon-[lucide--arrow-up]"
				label="Send"
				class="ml-auto"
				disabled={!chosen}
			/>
		{:else}
			<Button
				type="submit"
				variant="primary"
				icon="icon-[lucide--arrow-up]"
				class="ml-auto"
				disabled={!chosen}
			>
				{prompt.value()?.trim() ? 'Get to work' : project ? 'Start project' : 'Start workspace'}
			</Button>
		{/if}
	{/snippet}
</MessageComposer>
