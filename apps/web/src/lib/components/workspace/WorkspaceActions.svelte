<script lang="ts">
	import type { WorkspaceAction, WorkspaceStanding } from '#lib/actions.ts';
	import Button from '#lib/ui/Button.svelte';

	type Props = {
		/** Where the workspace stands, in a few words. */
		standing: WorkspaceStanding | null;
		/** Its pull request, if it has one, to link to. */
		pull?: { number: string; url: string | null } | null;
		/** What could happen next, the most pressing first. */
		actions: WorkspaceAction[];
		/** The actions already under way: asked of the agent and not done yet. */
		pending?: WorkspaceAction['id'][];
		onaction(action: WorkspaceAction): void;
	};
	let { standing, pull = null, actions, pending = [], onaction }: Props = $props();

	const tones = {
		ok: 'bg-ok/12 text-ok',
		danger: 'bg-danger-soft text-danger',
		accent: 'bg-accent-soft text-accent-ink',
		neutral: 'bg-sunken text-muted'
	};
</script>

<!--
	Where the workspace stands and what to do about it, as one unit: the standing colours the
	whole thing, and the first action is the next step.
-->
{#if standing || actions.length > 0}
	<div
		role="group"
		aria-label="Next steps"
		class={[
			'inline-flex h-9 shrink-0 items-center gap-1 rounded-full pr-1 pl-3',
			tones[standing?.tone ?? 'neutral']
		]}
	>
		{#if standing}
			<span class={['size-4 shrink-0', standing.icon]}></span>
			<span class="pr-1.5 pl-1 text-sm font-medium whitespace-nowrap">{standing.label}</span>
		{/if}
		{#if pull}
			<svelte:element
				this={pull.url ? 'a' : 'span'}
				href={pull.url}
				target="_blank"
				rel="noreferrer"
				class={[
					'mr-1.5 flex items-center gap-0.5 code-dense opacity-80',
					pull.url && 'hover:opacity-100'
				]}
				title="Open the pull request"
			>
				#{pull.number}
				{#if pull.url}<span class="icon-[lucide--arrow-up-right] size-3.5"></span>{/if}
			</svelte:element>
		{/if}
		{#each actions as action, index (action.id)}
			<Button
				size="sm"
				variant={index === 0 ? 'primary' : 'secondary'}
				icon={action.icon}
				disabled={pending.includes(action.id)}
				onclick={() => onaction(action)}
				class={index === 0 ? '' : 'bg-surface text-ink'}
			>
				{action.label}
			</Button>
		{/each}
	</div>
{/if}
