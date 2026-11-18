<script lang="ts">
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import { problemOf } from '#lib/problem.ts';
	let {
		repos,
		grants,
		issue,
		revoke
	}: {
		repos: { id: string; name: string }[];
		grants: { id: string; name: string; repoId: string }[];
		issue: (input: { repoId: string; name: string }) => Promise<string>;
		revoke: (id: string) => Promise<unknown>;
	} = $props();
	let repoId = $state('');
	let name = $state('');
	let token = $state('');
	let problem = $state('');
	let busy = $state(false);
	const selected = $derived(repos.find((repo) => repo.id === repoId)?.id ?? repos[0]?.id);
	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (!selected || busy) return;
		busy = true;
		problem = token = '';
		try {
			token = await issue({ repoId: selected, name });
			name = '';
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
	Give an external MCP client access to read and message workspaces in one repository.
</p>
{#if repos.length}
	<form class="space-y-3" onsubmit={create}>
		<label class="block text-sm"
			>Repository
			<select
				class="mt-1 w-full input"
				value={selected}
				onchange={(e) => (repoId = e.currentTarget.value)}
			>
				{#each repos as repo (repo.id)}<option value={repo.id}>{repo.name}</option>{/each}
			</select></label
		>
		<label class="block text-sm"
			>Agent name
			<input
				class="mt-1 w-full input"
				bind:value={name}
				maxlength="80"
				placeholder="Release assistant"
			/></label
		>
		<Button type="submit" variant="primary" disabled={busy || !name.trim()}>Create token</Button>
	</form>
{:else}<p class="empty">Add a repository to create a token.</p>{/if}
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
		<input class="w-full input code" aria-label="Bearer token" readonly value={token} />
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
					<p class="text-xs text-muted">{repos.find((repo) => repo.id === grant.repoId)?.name}</p>
				</div>
				<Button variant="ghost" onclick={() => remove(grant.id)}>Revoke</Button>
			</li>
		{/each}
	</ul>
{/if}
