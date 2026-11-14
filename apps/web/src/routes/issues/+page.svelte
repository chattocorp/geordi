<script lang="ts">
	import Button from '#lib/ui/Button.svelte';
	import Composer from '#lib/ui/Composer.svelte';
	import Page from '#lib/ui/Page.svelte';
	import { closeIssue, getIssues, openIssue, reopenIssue } from './issues.remote';

	const issues = getIssues();
	const { title, body } = openIssue.fields;
</script>

<Page title="Issues">
	<Composer
		form={openIssue}
		placeholder="Description (optional)"
		field={body.as('text')}
		problems={title.issues()?.map((problem) => problem.message)}
	>
		{#snippet header()}
			<input
				{...title.as('text')}
				placeholder="Title"
				aria-label="Title"
				class="block w-full bg-transparent px-4 pt-2 font-medium placeholder:text-muted/60 focus-visible:outline-none"
			/>
		{/snippet}
		{#snippet footer()}
			<Button type="submit" variant="primary" class="ml-auto">Open issue</Button>
		{/snippet}
	</Composer>

	<ul class="divide-y divide-line/70 overflow-hidden card">
		{#each await issues as issue (issue.number)}
			<li class="flex items-center gap-4 px-5 py-2.5">
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
				<span class="code-dense text-muted">#{issue.number}</span>
				<Button
					variant="ghost"
					size="sm"
					onclick={() => (issue.state === 'open' ? closeIssue : reopenIssue)(issue.number)}
				>
					{issue.state === 'open' ? 'Close' : 'Reopen'}
				</Button>
			</li>
		{:else}
			<li class="px-4 py-10 text-center text-muted">No issues yet. Open one above.</li>
		{/each}
	</ul>

	<p class="flex items-center gap-2 text-sm text-muted">
		<span class={['dot', issues.connected ? 'bg-ok' : 'bg-danger']}></span>
		{issues.connected ? 'Updating live' : 'Reconnecting'}
	</p>
</Page>
