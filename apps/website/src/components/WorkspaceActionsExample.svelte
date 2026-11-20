<script lang="ts">
	import type { PullRequest, Upstream } from '@geordi/protocol';
	import { actionsFor, standingOf, type WorkspaceAction } from '@geordi/ui/actions';
	import Button from '@geordi/ui/Button.svelte';
	import PullRequestPane from '@geordi/ui/PullRequestPane.svelte';
	import WorkspaceActions from '@geordi/ui/WorkspaceActions.svelte';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';

	type Stage = 'edited' | 'failing' | 'ready' | 'merged' | 'archived' | 'continued';
	let stage = $state<Stage>('edited');
	let showPull = $state(false);

	const checkState = $derived(stage === 'failing' ? 'failure' : 'success');
	const pull = $derived<PullRequest | null>(
		stage === 'edited'
			? null
			: {
					number: '1',
					title: 'Explain what the example repository is for',
					url: null,
					state: stage === 'merged' ? 'merged' : 'open',
					draft: false,
					base: 'main',
					review: null,
					checks: {
						state: checkState,
						total: 1,
						failed: stage === 'failing' ? 1 : 0,
						url: null,
						items: [
							{
								id: 'docs',
								name: 'Check Markdown',
								state: checkState,
								status: checkState
							}
						]
					}
				}
	);
	const upstream = $derived<Upstream>({
		forge: 'github',
		repo: 'example/readme',
		repoUrl: null,
		branch: 'docs/readme',
		createUrl: null,
		pushed: !!pull,
		pull
	});
	const git = $derived({
		upstream,
		changes: {
			files: [{ path: 'README.md', status: 'modified' as const, added: 2, removed: 0 }],
			uncommitted: pull ? 0 : 1,
			unpushed: 0
		}
	});
	const standing = $derived(standingOf(git));
	const actions = $derived(actionsFor(git));

	function act(action: WorkspaceAction) {
		switch (action.id) {
			case 'create-pull':
				stage = 'failing';
				break;
			case 'fix-checks':
				stage = 'ready';
				break;
			case 'merge-pull':
				stage = 'merged';
				break;
			case 'archive':
				stage = 'archived';
				break;
			case 'continue':
				stage = 'continued';
				break;
		}
	}
</script>

<figure
	class="not-prose my-6 space-y-2 rounded-card bg-frame p-2"
	aria-label="Workspace actions example"
>
	{#if stage === 'archived' || stage === 'continued'}
		<div class="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface p-3">
			<p role="status">
				{stage === 'archived'
					? 'The workspace is in Archive.'
					: 'The conversation continues on a fresh branch.'}
			</p>
			<Button
				size="sm"
				onclick={() => {
					stage = 'edited';
					showPull = false;
				}}>Try again</Button
			>
		</div>
	{:else}
		<div class="space-y-2 rounded-control bg-surface p-3">
			<p class="label">Workspace ribbon</p>
			<WorkspaceActions
				{standing}
				{actions}
				{pull}
				onaction={act}
				onopenpull={() => (showPull = !showPull)}
			/>
			{#if showPull && pull}<PullRequestPane {pull} />{/if}
		</div>
		<div class="space-y-1 rounded-control bg-sidebar p-3">
			<p class="label">Sidebar</p>
			<WorkspaceRow title="Explain Geordi in README" {standing} {actions} onaction={act} />
		</div>
	{/if}
</figure>
