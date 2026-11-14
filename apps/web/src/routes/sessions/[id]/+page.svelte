<script lang="ts">
	import { untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AgentAvatar from '#lib/components/AgentAvatar.svelte';
	import Markdown from '#lib/components/Markdown.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import ToolGroup from '#lib/components/ToolGroup.svelte';
	import { submitOnEnter } from '#lib/keys.ts';
	import { toBlocks } from '#lib/transcript.ts';
	import { getRepo } from '../../repos.remote';
	import { getSession, sendMessage, stopSession } from '../../sessions.remote';

	let { params } = $props();

	const query = $derived(getSession(params.id));
	const session = $derived(await query);
	const repo = $derived(await getRepo(session.repoId));
	const running = $derived(session.status === 'running');
	const blocks = $derived(toBlocks(session.transcript));
	const { sessionId, text } = sendMessage.fields;

	// Follow new output while the reader is at the bottom; leave them alone once they scroll up.
	let following = $state(true);
	const atBottom = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 80;
	const toLatest = () => {
		following = true;
		scrollTo({ top: document.documentElement.scrollHeight });
	};
	afterNavigate(toLatest);
	$effect(() => {
		void blocks;
		if (untrack(() => following)) toLatest();
	});
</script>

<svelte:window onscroll={() => (following = atBottom())} />

<svelte:head><title>{session.title} · Geordi</title></svelte:head>

<main class="flex flex-1 flex-col">
	<header class="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur-md">
		<div class="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3">
			<AgentAvatar agent={session.agent} />
			<div class="min-w-0 flex-1">
				<h1 class="truncate font-semibold tracking-tight" title={session.title}>{session.title}</h1>
				<div class="flex items-center gap-3 text-xs text-muted">
					<a
						href={resolve('/repos/[id]', { id: repo.id })}
						class="flex shrink-0 items-center gap-1 hover:text-ink"
					>
						<span class="icon-[lucide--folder-git-2] size-3.5"></span>
						{repo.name}
					</a>
					{#if session.worktree}
						<span class="flex min-w-0 items-center gap-1" title={session.worktree.path}>
							<span class="icon-[lucide--git-branch] size-3.5 shrink-0"></span>
							<span class="truncate font-mono">{session.worktree.branch}</span>
						</span>
					{/if}
					{#if !query.connected}
						<span class="flex items-center gap-1 text-danger">
							<span class="icon-[lucide--unplug] size-3.5"></span>
							Reconnecting
						</span>
					{/if}
				</div>
			</div>
			<StatusBadge {running} />
		</div>
		{#if running}
			<div class="visor" role="status" aria-label="The agent is working"></div>
		{/if}
	</header>

	<ol class="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-8">
		{#each blocks as block, i (i)}
			<li>
				{#if block.kind === 'user'}
					<div
						class="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-bubble px-4 py-2.5 whitespace-pre-wrap"
					>
						{block.text}
					</div>
				{:else}
					<div class="flex gap-3.5">
						<AgentAvatar agent={session.agent} />
						<div class="min-w-0 flex-1 space-y-3 pt-0.5">
							{#each block.parts as part, j (j)}
								{#if part.kind === 'text'}
									<Markdown text={part.text} />
								{:else if part.kind === 'tools'}
									<ToolGroup tools={part.tools} cwd={session.worktree?.path} />
								{:else}
									<div
										class="flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
									>
										<span class="mt-0.5 icon-[lucide--triangle-alert] size-4 shrink-0"></span>
										<p>{part.error}</p>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			</li>
		{/each}
	</ol>

	<div class="sticky bottom-0 bg-linear-to-t from-bg from-60% to-transparent pt-6">
		{#if !following}
			<button
				type="button"
				onclick={toLatest}
				class="absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface py-1.5 pr-3.5 pl-3 text-sm font-medium shadow-float ring-1 ring-line/60 hover:text-accent-ink"
			>
				<span class="icon-[lucide--arrow-down] size-3.5"></span>
				Jump to latest
			</button>
		{/if}
		<form {...sendMessage} class="mx-auto max-w-3xl px-6 pb-5">
			<input {...sessionId.as('hidden', session.id)} />
			<div
				class="rounded-2xl bg-surface shadow-float ring-1 ring-line/60 focus-within:ring-accent/60"
			>
				<label for="reply" class="sr-only">Reply to the agent</label>
				<textarea
					{...text.as('text')}
					id="reply"
					rows="2"
					placeholder={running ? 'The agent is working…' : 'Reply to the agent'}
					disabled={running}
					onkeydown={submitOnEnter}
					class="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 placeholder:text-muted/60 focus-visible:outline-none disabled:cursor-not-allowed"
				></textarea>
				<div class="flex items-center gap-2 px-3 pb-3">
					{#each text.issues() ?? [] as problem (problem.message)}
						<p class="text-sm text-danger">{problem.message}</p>
					{:else}
						<p class="hidden text-xs text-muted sm:block">
							Enter to send, Shift+Enter for a new line
						</p>
					{/each}
					{#if running}
						<button
							type="button"
							onclick={() => stopSession(session.id)}
							class="ml-auto flex items-center gap-2 rounded-full bg-sunken py-1.5 pr-3.5 pl-3 text-sm font-medium ring-1 ring-line hover:bg-line/50"
						>
							<span class="icon-[lucide--square] size-3.5"></span>
							Stop
						</button>
					{:else}
						<button
							class="ml-auto grid size-8 place-items-center rounded-full bg-accent text-on-accent shadow-soft hover:brightness-105"
							aria-label="Send"
						>
							<span class="icon-[lucide--arrow-up] size-4.5"></span>
						</button>
					{/if}
				</div>
			</div>
		</form>
	</div>
</main>
