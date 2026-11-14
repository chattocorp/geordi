<script lang="ts">
	import { closeIssue, getIssues, openIssue, reopenIssue } from './issues.remote';

	const issues = getIssues();
	const { title, body } = openIssue.fields;
</script>

<main class="mx-auto max-w-2xl space-y-8 p-8">
	<h1 class="text-2xl font-bold">Issues</h1>

	<form {...openIssue} class="space-y-2">
		<input {...title.as('text')} placeholder="Title" class="w-full rounded border p-2" />
		{#each title.issues() ?? [] as problem (problem.message)}
			<p class="text-sm text-red-600">{problem.message}</p>
		{/each}
		<textarea {...body.as('text')} placeholder="Description" class="w-full rounded border p-2"
		></textarea>
		<button class="rounded bg-black px-4 py-2 text-white">Open issue</button>
	</form>

	<ul class="divide-y">
		{#each await issues as issue (issue.number)}
			<li class="flex items-center justify-between py-2">
				<span class={issue.state === 'closed' ? 'text-gray-400 line-through' : ''}>
					#{issue.number}
					{issue.title}
				</span>
				<button
					class="text-sm text-gray-500 hover:underline"
					onclick={() => (issue.state === 'open' ? closeIssue : reopenIssue)(issue.number)}
				>
					{issue.state === 'open' ? 'Close' : 'Reopen'}
				</button>
			</li>
		{:else}
			<li class="py-2 text-gray-500">No issues yet.</li>
		{/each}
	</ul>

	<p class="font-mono text-xs text-gray-400">
		<span class={issues.connected ? 'text-green-600' : 'text-red-600'}>●</span>
		{issues.connected ? 'live' : 'disconnected'}
	</p>
</main>
