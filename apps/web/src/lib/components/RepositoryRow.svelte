<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount, type Snippet } from 'svelte';
	import type { ForgeDiagnostic } from '@geordi/protocol';
	import Button from '@geordi/ui/Button.svelte';
	import Disclosure from '@geordi/ui/Disclosure.svelte';
	import { FORGE_SETUP_URL } from '@geordi/ui/actions';
	import { problemOf } from '#lib/problem.ts';
	import RepoIcon from './RepoIcon.svelte';

	/**
	 * A repository in Settings: whether the daemon can read it on its forge at a glance, and
	 * unfolded, what it found and where the repository is.
	 */
	let {
		repo,
		openWorkspaces,
		check,
		onremove
	}: {
		repo: { id: string; name: string; path: string; workspaceCount: number };
		openWorkspaces: { id: string; title: string }[];
		check: () => Promise<ForgeDiagnostic>;
		onremove: () => void;
	} = $props();

	let forge = $state<ForgeDiagnostic>();
	let checking = $state(false);

	async function run() {
		checking = true;
		try {
			forge = await check();
		} catch (error) {
			forge = { status: 'problem', summary: problemOf(error, 'Could not ask the daemon') };
		} finally {
			checking = false;
		}
	}
	// Once per showing: the live views re-render the list often, and each check reaches the forge.
	onMount(() => void run());

	const icons = {
		ok: 'icon-[lucide--circle-check] text-ok',
		problem: 'icon-[lucide--circle-alert] text-danger',
		none: 'icon-[lucide--circle-minus] text-muted'
	};
	const forgeNames: Record<string, string> = {
		github: 'GitHub',
		gitlab: 'GitLab',
		forgejo: 'Forgejo',
		gitea: 'Gitea',
		bitbucket: 'Bitbucket'
	};
	const workspaces = $derived(
		repo.workspaceCount === 1 ? '1 workspace' : `${repo.workspaceCount} workspaces`
	);
</script>

<Disclosure summaryClass="cursor-pointer gap-3 px-2 py-2 hover:bg-hover">
	{#snippet heading()}
		<span
			aria-hidden="true"
			class="grid size-8 shrink-0 place-items-center rounded-control bg-sunken"
		>
			<RepoIcon id={repo.id} name={repo.name} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block truncate text-sm font-medium">{repo.name}</span>
			<span role="status" class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
				{#if forge && !checking}
					<span aria-hidden="true" class={['size-3.5 shrink-0', icons[forge.status]]}></span>
					<span class="truncate">{forge.summary}</span>
				{:else}
					<span aria-hidden="true" class="icon-[lucide--circle-dashed] size-3.5 shrink-0"></span>
					<span>Checking forge access…</span>
				{/if}
			</span>
		</span>
		{#if repo.workspaceCount}
			<span class="shrink-0 text-sm text-muted">{workspaces}</span>
		{/if}
	{/snippet}

	<div class="mt-1 mr-2 mb-2 ml-13 space-y-3 rounded-control bg-sunken px-3 py-3">
		<dl class="space-y-1.5 text-xs">
			{#snippet row(label: string, value: Snippet)}
				<div class="flex items-baseline gap-4">
					<dt class="w-20 shrink-0 label">{label}</dt>
					<dd class="min-w-0 flex-1">{@render value()}</dd>
				</div>
			{/snippet}
			{#snippet path(text: string)}
				<!-- Long paths wrap after a slash, never inside a name. -->
				<span class="code-dense break-words text-prose">
					{#each text.split('/') as part, i (i)}{#if i}/<wbr />{/if}{part}{/each}
				</span>
			{/snippet}
			{#snippet directory()}{@render path(repo.path)}{/snippet}
			{#snippet origin()}
				{#if forge?.origin}{@render path(forge.origin)}
				{:else}<span class="text-muted">{forge ? 'None' : '…'}</span>{/if}
			{/snippet}
			{#snippet kind()}
				{#if forge?.forge}
					{forgeNames[forge.forge] ?? forge.forge} · {forge.access === 'anonymous'
						? 'anonymous'
						: 'signed in with the daemon’s credentials'}
				{:else}<span class="text-muted">{forge ? 'Not recognised' : '…'}</span>{/if}
			{/snippet}
			{#snippet problem()}
				{forge?.summary}
				{#if forge?.setup}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- an external guide -->
					<a
						class="ml-1 font-medium text-ink hover:underline"
						href={FORGE_SETUP_URL}
						target="_blank"
						rel="noreferrer"
					>
						Setup guide
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
			{/snippet}
			{@render row('Directory', directory)}
			{@render row('Origin', origin)}
			{@render row('Forge', kind)}
			{#if forge?.status === 'problem'}{@render row('Problem', problem)}{/if}
		</dl>
		{#if openWorkspaces.length}
			<p class="text-xs text-muted">Archive these workspaces to remove this repository.</p>
			<ul class="space-y-1 text-sm">
				{#each openWorkspaces as workspace (workspace.id)}
					<li>
						<a class="hover:underline" href={resolve('/workspaces/[id]', { id: workspace.id })}>
							{workspace.title}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			<Button size="sm" icon="icon-[lucide--refresh-cw]" busy={checking} onclick={run}>
				Check again
			</Button>
			<Button
				size="sm"
				variant="ghost"
				icon="icon-[lucide--trash-2]"
				disabled={repo.workspaceCount > 0}
				title={repo.workspaceCount
					? `Archive ${repo.name}'s workspaces to remove it`
					: 'Geordi forgets it; nothing on disk changes'}
				onclick={onremove}
			>
				Remove
			</Button>
		</div>
	</div>
</Disclosure>
