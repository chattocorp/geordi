<script lang="ts">
	import { resolve } from '$app/paths';
	import { AGENTS } from '@geordi/protocol';
	import { getRepo } from '../../repos.remote';
	import { createSession, getSessions } from '../../sessions.remote';

	let { params } = $props();

	const repo = $derived(await getRepo(params.id));
	const sessions = $derived(getSessions(params.id));
	const { repoId, agent, prompt } = createSession.fields;
</script>

<main class="mx-auto max-w-3xl space-y-8 p-8">
	<header>
		<a href={resolve('/')} class="text-sm text-gray-500 hover:underline">← Repositories</a>
		<h1 class="text-2xl font-bold">{repo.name}</h1>
		<p class="font-mono text-xs text-gray-500">{repo.path}</p>
	</header>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">New agent session</h2>
		<form {...createSession} class="space-y-2">
			<input {...repoId.as('hidden', repo.id)} />
			<textarea
				{...prompt.as('text')}
				rows="4"
				placeholder="What should the agent do?"
				class="w-full rounded border p-2"></textarea>
			{#each prompt.issues() ?? [] as problem (problem.message)}
				<p class="text-sm text-red-600">{problem.message}</p>
			{/each}
			<div class="flex items-center gap-4">
				{#each AGENTS as name (name)}
					<label class="flex items-center gap-1">
						<input {...agent.as('radio', name, name === 'claude')} />
						{name}
					</label>
				{/each}
				<button class="ml-auto rounded bg-black px-4 py-2 text-white">Start session</button>
			</div>
		</form>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Sessions</h2>
		<ul class="divide-y rounded border">
			{#each await sessions as session (session.id)}
				<li>
					<a
						href={resolve('/sessions/[id]', { id: session.id })}
						class="flex items-center gap-3 p-3 hover:bg-gray-50"
					>
						<span
							class={[
								'size-2 rounded-full',
								session.status === 'running' ? 'bg-green-500' : 'bg-gray-300'
							]}
						></span>
						<span class="flex-1 truncate">{session.title}</span>
						<span class="font-mono text-xs text-gray-500">{session.agent}</span>
					</a>
				</li>
			{:else}
				<li class="p-3 text-gray-500">No sessions yet.</li>
			{/each}
		</ul>
	</section>
</main>
