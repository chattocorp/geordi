<script lang="ts">
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import { problemOf } from '#lib/problem.ts';
	let {
		grants,
		issue,
		revoke
	}: {
		grants: { id: string; name: string }[];
		issue: (name: string) => Promise<string>;
		revoke: (id: string) => Promise<unknown>;
	} = $props();
	let name = $state('');
	let token = $state('');
	let problem = $state('');
	let busy = $state(false);
	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		problem = token = '';
		try {
			token = await issue(name);
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
	Give an external MCP client access to read and message any workspace in this Geordi installation.
</p>

<form class="space-y-3" onsubmit={create}>
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
				<p class="min-w-0 flex-1 truncate text-sm font-medium">{grant.name}</p>
				<Button variant="ghost" onclick={() => remove(grant.id)}>Revoke</Button>
			</li>
		{/each}
	</ul>
{/if}
