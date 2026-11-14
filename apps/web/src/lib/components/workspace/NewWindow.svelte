<script lang="ts">
	import type { Agent } from '@geordi/protocol';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import { timeAgo } from '#lib/format.ts';
	import { submitOnEnter } from '#lib/keys.ts';
	import type { Session } from '#lib/server/workspaces.ts';
	import { createSession } from '../../../routes/workspaces.remote';
	import AgentPicker from './AgentPicker.svelte';

	type Props = {
		workspaceId: string;
		/** Sessions of this workspace that have no window right now. */
		closed: Session[];
		/** Called with the ID of a session (new or existing) to show in place of this window. */
		onopen(sessionId: string): void;
	};
	let { workspaceId, closed, onopen }: Props = $props();

	let agent = $state<Agent>('claude');
	let prompt = $state('');
	let problem = $state<string | null>(null);
	let starting = $state(false);

	async function start(event: SubmitEvent) {
		event.preventDefault();
		if (!prompt.trim() || starting) return;
		starting = true;
		problem = null;
		try {
			onopen(await createSession({ workspaceId, agent, prompt }));
		} catch (error) {
			problem = error instanceof Error ? error.message : 'Could not start the session';
		} finally {
			starting = false;
		}
	}
</script>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto w-full max-w-2xl space-y-8 px-5 py-8">
		<form
			onsubmit={start}
			class="rounded-2xl bg-surface shadow-float ring-1 ring-line/60 focus-within:ring-accent/60"
		>
			<label for="new-session-prompt" class="block px-5 pt-5 text-sm font-medium">
				New session
			</label>
			<textarea
				id="new-session-prompt"
				bind:value={prompt}
				rows="3"
				placeholder="What should the agent do in this workspace?"
				onkeydown={submitOnEnter}
				class="block w-full resize-none bg-transparent px-5 py-2 text-base placeholder:text-muted/60 focus-visible:outline-none"
			></textarea>
			{#if problem}
				<p class="px-5 text-sm text-danger">{problem}</p>
			{/if}
			<div class="flex flex-wrap items-center gap-2 px-4 pt-2 pb-4">
				<AgentPicker bind:value={agent} />
				<button
					disabled={starting}
					class="ml-auto flex items-center gap-2 rounded-full bg-accent py-2 pr-4 pl-3.5 text-sm font-semibold text-on-accent shadow-soft hover:brightness-105 disabled:opacity-60"
				>
					<span class="icon-[lucide--arrow-up] size-4"></span>
					Start session
				</button>
			</div>
		</form>

		{#if closed.length > 0}
			<section class="space-y-2">
				<h2 class="text-sm font-medium text-muted">Closed sessions</h2>
				<ul class="space-y-1.5">
					{#each closed as session (session.id)}
						<li>
							<button
								type="button"
								onclick={() => onopen(session.id)}
								class="flex w-full items-center gap-3 rounded-xl bg-surface px-3.5 py-2.5 text-left shadow-soft ring-1 ring-line/60 hover:shadow-float"
							>
								<AgentAvatar agent={session.agent} size="sm" />
								<span class="min-w-0 flex-1 truncate text-sm font-medium">{session.title}</span>
								<span class="shrink-0 text-xs text-muted">{timeAgo(session.updatedAt)}</span>
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
</div>
