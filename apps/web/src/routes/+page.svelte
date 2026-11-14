<script lang="ts">
	import { resolve } from '$app/paths';
	import { getRepos, registerRepo } from './repos.remote';

	const repos = getRepos();
	const { path } = registerRepo.fields;
</script>

<main class="mx-auto max-w-3xl space-y-8 p-8">
	<header>
		<h1 class="text-3xl font-bold">Geordi</h1>
		<p class="text-gray-500">Self-hostable code forge &amp; agent orchestrator.</p>
	</header>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Repositories</h2>
		<ul class="divide-y rounded border">
			{#each await repos as repo (repo.id)}
				<li>
					<a href={resolve('/repos/[id]', { id: repo.id })} class="block p-3 hover:bg-gray-50">
						<span class="font-medium">{repo.name}</span>
						<span class="ml-2 font-mono text-xs text-gray-500">{repo.path}</span>
					</a>
				</li>
			{:else}
				<li class="p-3 text-gray-500">No repositories yet.</li>
			{/each}
		</ul>

		<form {...registerRepo} class="flex gap-2">
			<input
				{...path.as('text')}
				placeholder="~/src/my-project"
				class="flex-1 rounded border p-2 font-mono text-sm"
			/>
			<button class="rounded bg-black px-4 py-2 text-white">Register</button>
		</form>
		{#each path.issues() ?? [] as problem (problem.message)}
			<p class="text-sm text-red-600">{problem.message}</p>
		{/each}
	</section>

	<p><a href={resolve('/issues')} class="text-sm underline">Issues</a></p>
</main>
