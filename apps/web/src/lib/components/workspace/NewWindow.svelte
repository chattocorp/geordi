<script lang="ts">
	import type { Agent } from '@geordi/protocol';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import { timeAgo } from '#lib/format.ts';
	import type { Session } from '#lib/server/workspaces.ts';
	import Button from '#lib/ui/Button.svelte';
	import Composer from '#lib/ui/Composer.svelte';
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
	<div class="page max-w-2xl">
		<Composer
			form={{ onsubmit: start }}
			label="New session"
			placeholder="What should the agent do in this workspace?"
			bind:value={prompt}
			problems={problem ? [problem] : []}
		>
			{#snippet footer()}
				<AgentPicker bind:value={agent} />
				<Button
					type="submit"
					variant="primary"
					icon="icon-[lucide--arrow-up]"
					class="ml-auto"
					disabled={starting}
				>
					Start session
				</Button>
			{/snippet}
		</Composer>

		{#if closed.length > 0}
			<section class="space-y-2">
				<h2 class="label">Closed sessions</h2>
				<ul class="space-y-1.5">
					{#each closed as session (session.id)}
						<li>
							<button
								type="button"
								onclick={() => onopen(session.id)}
								class="flex w-full items-center gap-3 card px-3.5 py-2.5 text-left card-link"
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
