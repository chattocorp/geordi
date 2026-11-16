<script lang="ts">
	import type { WorkspaceAction, WorkspaceStanding } from '#lib/actions.ts';
	import Button from '#lib/ui/Button.svelte';
	import Spinner from '#lib/ui/Spinner.svelte';

	type Props = {
		/** Where the workspace stands, in a few words. */
		standing: WorkspaceStanding | null;
		/** Its pull request, if it has one, to link to. */
		pull?: { number: string; url: string | null } | null;
		/** What could happen next, the most pressing first. */
		actions: WorkspaceAction[];
		/** The actions already under way: asked of the agent and not done yet. */
		pending?: WorkspaceAction['id'][];
		/** Whether the agent is at work right now. */
		working?: boolean;
		/**
		 * How it stands is being found out right now (or again): what was known may no longer
		 * be so, and is not shown, nor offered to act on, until it is.
		 */
		checking?: boolean;
		onaction(action: WorkspaceAction): void;
	};
	let {
		standing,
		pull = null,
		actions,
		pending = [],
		working = false,
		checking = false,
		onaction
	}: Props = $props();

	const tones = {
		ok: 'bg-ok/12 text-ok',
		danger: 'bg-danger-soft text-danger',
		accent: 'bg-accent-soft text-accent-ink',
		merged: 'bg-merged/15 text-merged',
		neutral: 'bg-sunken text-muted'
	};
</script>

<!--
	Where the workspace stands and what to do about it, as one unit: the standing colours the
	whole thing, and the first action is the next step. An agent at work says so at its
	head; an idle one says nothing.
-->
{#if checking && !working}
	<div
		role="status"
		class={['inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3', tones.neutral]}
	>
		<Spinner plain label="Checking" />
		<span class="text-sm font-medium whitespace-nowrap">Checking</span>
	</div>
{:else if standing || actions.length > 0 || working}
	<div
		role="group"
		aria-label="Next steps"
		class={[
			'inline-flex h-9 shrink-0 items-center gap-1 rounded-full pl-3',
			// buttons reach the end of the pill; text keeps its distance
			actions.length > 0 ? 'pr-1' : 'pr-3',
			// with nothing else to say, it is the agent's own colour: at work
			tones[standing?.tone ?? (working ? 'accent' : 'neutral')]
		]}
	>
		{#if working}
			<span class="flex items-center gap-2 text-sm font-medium whitespace-nowrap" role="status">
				<Spinner plain />
				Working
			</span>
			{#if standing || actions.length > 0}
				<span class="mx-2 h-4 w-px shrink-0 bg-current opacity-25"></span>
			{/if}
		{/if}
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
				{#if pull.url}<span class="icon-[lucide--external-link] size-3.5"></span>{/if}
			</svelte:element>
		{/if}
		{#each actions as action (action.id)}
			<!-- the next step stands out; what else is possible, and what is beside it, doesn't -->
			{@const next = action === actions.find((candidate) => !candidate.aside)}
			<Button
				size="sm"
				variant={next ? 'primary' : 'soft'}
				tone={standing?.tone === 'merged' ? 'merged' : 'accent'}
				icon={action.icon}
				busy={pending.includes(action.id)}
				onclick={() => onaction(action)}
			>
				{action.label}
			</Button>
		{/each}
	</div>
{/if}
