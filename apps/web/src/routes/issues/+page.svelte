<script lang="ts">
	import { closeIssue, getIssues, openIssue, reopenIssue } from './issues.remote';

	const issues = getIssues();
	const { title, body } = openIssue.fields;
</script>

<svelte:head><title>Issues · Geordi</title></svelte:head>

<main class="mx-auto w-full max-w-3xl space-y-8 px-6 py-10">
	<h1 class="text-3xl font-semibold tracking-tight">Issues</h1>

	<form
		{...openIssue}
		class="rounded-2xl bg-surface shadow-float ring-1 ring-line/60 focus-within:ring-accent/60"
	>
		<label for="issue-title" class="sr-only">Title</label>
		<input
			{...title.as('text')}
			id="issue-title"
			placeholder="Title"
			class="block w-full rounded-t-2xl bg-transparent px-5 pt-4 pb-1 font-medium placeholder:text-muted/70 focus-visible:outline-none"
		/>
		<label for="issue-body" class="sr-only">Description</label>
		<textarea
			{...body.as('text')}
			id="issue-body"
			rows="3"
			placeholder="Description (optional)"
			class="block w-full resize-y bg-transparent px-5 py-2 placeholder:text-muted/70 focus-visible:outline-none"
		></textarea>
		<div class="flex items-center px-4 pb-4">
			{#each title.issues() ?? [] as problem (problem.message)}
				<p class="text-sm text-danger">{problem.message}</p>
			{/each}
			<button
				class="ml-auto rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-soft hover:brightness-105"
			>
				Open issue
			</button>
		</div>
	</form>

	<ul
		class="divide-y divide-line/70 overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-line/60"
	>
		{#each await issues as issue (issue.number)}
			<li class="flex items-center gap-4 px-5 py-3">
				<span
					class={[
						'size-4 shrink-0',
						issue.state === 'open'
							? 'icon-[lucide--circle-dot] text-ok'
							: 'icon-[lucide--circle-check] text-muted'
					]}
					title={issue.state === 'open' ? 'Open' : 'Closed'}
				></span>
				<span class={['min-w-0 flex-1 truncate', issue.state === 'closed' && 'text-muted']}>
					{issue.title}
				</span>
				<span class="font-mono text-[13px] text-muted">#{issue.number}</span>
				<button
					class="rounded-md px-2.5 py-1 text-sm text-muted hover:bg-sunken hover:text-ink"
					onclick={() => (issue.state === 'open' ? closeIssue : reopenIssue)(issue.number)}
				>
					{issue.state === 'open' ? 'Close' : 'Reopen'}
				</button>
			</li>
		{:else}
			<li class="px-4 py-10 text-center text-muted">No issues yet. Open one above.</li>
		{/each}
	</ul>

	<p class="text-sm text-muted">
		<span
			class={['mr-1 inline-block size-2 rounded-full', issues.connected ? 'bg-ok' : 'bg-danger']}
		></span>
		{issues.connected ? 'Updating live' : 'Reconnecting'}
	</p>
</main>
