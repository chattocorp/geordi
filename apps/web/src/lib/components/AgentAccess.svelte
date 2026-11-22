<script lang="ts">
	import EmptyState from '@geordi/ui/EmptyState.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import MessageCopy from '@geordi/ui/MessageCopy.svelte';
	import { problemOf } from '#lib/problem.ts';
	type Repo = { id: string; name: string };
	let {
		repos,
		grants,
		issue,
		revoke
	}: {
		repos: Repo[];
		grants: { id: string; name: string; repoIds: string[] }[];
		issue: (input: { name: string; repoIds: string[] }) => Promise<string>;
		revoke: (id: string) => Promise<unknown>;
	} = $props();
	let name = $state('');
	/** The repositories the next token is for; All and None only change this. */
	let chosen = $state<string[]>([]);
	const repoIds = $derived(chosen.filter((id) => repos.some((repo) => repo.id === id)));
	const namesOf = (ids: string[]) =>
		repos
			.filter((repo) => ids.includes(repo.id))
			.map((repo) => repo.name)
			.join(', ') || 'No repositories';
	let token = $state('');
	let problem = $state('');
	let busy = $state(false);
	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		problem = token = '';
		try {
			token = await issue({ name, repoIds });
			name = '';
			chosen = [];
		} catch (error) {
			problem = problemOf(error, 'Could not create token');
		} finally {
			busy = false;
		}
	}
	async function remove(id: string) {
		try {
			await revoke(id);
			token = '';
			problem = '';
		} catch (error) {
			problem = problemOf(error, 'Could not revoke token');
		}
	}
</script>

<h2 class="heading">Agent access</h2>
<p class="mt-1 mb-5 text-sm text-muted">
	Let an MCP client outside Geordi read and message the workspaces of the repositories you choose,
	and start agents of its own in them. Repositories you add later are not included.
</p>

<form class="space-y-3" onsubmit={create}>
	<label class="block text-sm">
		Agent name
		<input
			class="mt-1 w-full input"
			bind:value={name}
			maxlength="80"
			placeholder="Release assistant"
		/>
	</label>
	<div role="group" aria-labelledby="access-repos">
		<div class="mb-1 flex items-center gap-1">
			<p id="access-repos" class="flex-1 text-sm">Repositories</p>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={() => (chosen = repos.map((r) => r.id))}
			>
				All
			</Button>
			<Button type="button" variant="ghost" size="sm" onclick={() => (chosen = [])}>None</Button>
		</div>
		{#if repos.length}
			<ul class="card py-1">
				{#each repos as repo (repo.id)}
					<li>
						<label class="flex items-center gap-2.5 px-3.5 py-1.5 text-sm">
							<input
								type="checkbox"
								class="cursor-pointer accent-accent"
								bind:group={chosen}
								value={repo.id}
							/>
							<span class="min-w-0 truncate">{repo.name}</span>
						</label>
					</li>
				{/each}
			</ul>
		{:else}
			<EmptyState icon="icon-[lucide--folder-git-2]" title="No repositories yet">
				Add one in Repositories.
			</EmptyState>
		{/if}
	</div>
	<Button type="submit" variant="primary" disabled={busy || !name.trim() || !repoIds.length}>
		Create token
	</Button>
</form>

{#if token}
	<div class="mt-4 space-y-2 card p-3">
		<p class="text-sm">
			Use this URL and bearer token in your MCP client. Copy the token before closing Settings.
		</p>
		<input
			class="w-full input code"
			aria-label="MCP URL"
			readonly
			value={new URL('/mcp', window.location.origin).href}
		/>
		<div class="flex items-center gap-2">
			<input class="min-w-0 flex-1 input code" aria-label="Bearer token" readonly value={token} />
			<MessageCopy text={token} label="Copy token" />
		</div>
	</div>
{/if}
{#if problem}<Notice>{problem}</Notice>{/if}
{#if grants.length}
	<h3 class="mt-6 mb-2 heading">Active tokens</h3>
	<ul class="space-y-2">
		{#each grants as grant (grant.id)}
			<li class="flex items-center gap-3">
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{grant.name}</p>
					<p class="truncate text-xs text-muted">{namesOf(grant.repoIds)}</p>
				</div>
				<Button variant="ghost" onclick={() => remove(grant.id)}>Revoke</Button>
			</li>
		{/each}
	</ul>
{/if}
