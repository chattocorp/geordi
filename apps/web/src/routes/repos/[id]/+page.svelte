<script lang="ts">
	import { resolve } from '$app/paths';
	import { AGENTS } from '@geordi/protocol';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { agentName, timeAgo } from '#lib/format.ts';
	import { submitOnEnter } from '#lib/keys.ts';
	import { getRepo } from '../../repos.remote';
	import { createSession, getSessions } from '../../sessions.remote';

	let { params } = $props();

	const repo = $derived(await getRepo(params.id));
	const sessions = $derived(getSessions(params.id));
	const { repoId, agent, prompt } = createSession.fields;
</script>

<svelte:head><title>{repo.name} · Geordi</title></svelte:head>

<main class="mx-auto w-full max-w-3xl space-y-10 px-6 py-10">
	<header class="space-y-1">
		<h1 class="text-3xl font-semibold tracking-tight">{repo.name}</h1>
		<p class="truncate font-mono text-xs text-muted" title={repo.path}>{repo.path}</p>
	</header>

	<form
		{...createSession}
		class="rounded-2xl bg-surface shadow-float ring-1 ring-line/60 focus-within:ring-accent/60"
	>
		<input {...repoId.as('hidden', repo.id)} />
		<label for="prompt" class="block px-5 pt-5 text-sm font-medium">New session</label>
		<textarea
			{...prompt.as('text')}
			id="prompt"
			rows="3"
			placeholder="What should the agent do?"
			onkeydown={submitOnEnter}
			class="block w-full resize-none bg-transparent px-5 py-2 text-lg placeholder:text-muted/60 focus-visible:outline-none"
		></textarea>
		{#each prompt.issues() ?? [] as problem (problem.message)}
			<p class="px-5 text-sm text-danger">{problem.message}</p>
		{/each}
		<div class="flex flex-wrap items-center gap-2 px-4 pt-2 pb-4">
			<fieldset class="flex gap-1.5">
				<legend class="sr-only">Agent</legend>
				{#each AGENTS as name (name)}
					<label
						class="flex cursor-pointer items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm text-muted ring-1 ring-line has-checked:bg-sunken has-checked:text-ink has-checked:ring-ink/20 has-focus-visible:outline-2 has-focus-visible:outline-accent"
					>
						<input {...agent.as('radio', name, name === 'claude')} class="sr-only" />
						<AgentAvatar agent={name} size="sm" />
						{agentName[name]}
					</label>
				{/each}
			</fieldset>
			<button
				class="ml-auto flex items-center gap-2 rounded-full bg-accent py-2 pr-4 pl-3.5 text-sm font-semibold text-on-accent shadow-soft hover:brightness-105"
			>
				<span class="icon-[lucide--arrow-up] size-4"></span>
				Start session
			</button>
		</div>
	</form>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold tracking-tight">Sessions</h2>
		<ul class="space-y-2">
			{#each await sessions as session (session.id)}
				<li>
					<a
						href={resolve('/sessions/[id]', { id: session.id })}
						class="flex items-center gap-3.5 rounded-xl bg-surface px-4 py-3 shadow-soft ring-1 ring-line/60 transition-shadow hover:shadow-float"
					>
						<AgentAvatar agent={session.agent} />
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium">{session.title}</p>
							<p class="text-xs text-muted">{timeAgo(session.updatedAt)}</p>
						</div>
						<StatusBadge running={session.status === 'running'} />
					</a>
				</li>
			{:else}
				<li class="rounded-xl border border-dashed border-line px-4 py-10 text-center text-muted">
					No sessions yet. Describe a task above to start one.
				</li>
			{/each}
		</ul>
	</section>
</main>
