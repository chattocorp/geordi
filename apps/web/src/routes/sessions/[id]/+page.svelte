<script lang="ts">
	import { resolve } from '$app/paths';
	import { getSession, sendMessage, stopSession } from '../../sessions.remote';

	let { params } = $props();

	const query = $derived(getSession(params.id));
	const session = $derived(await query);
	const { sessionId, text } = sendMessage.fields;
</script>

<main class="mx-auto flex max-w-3xl flex-col gap-6 p-8">
	<header class="space-y-1">
		<a
			href={resolve('/repos/[id]', { id: session.repoId })}
			class="text-sm text-gray-500 hover:underline">← {session.repoId}</a
		>
		<h1 class="text-xl font-bold">{session.title}</h1>
		<p class="font-mono text-xs text-gray-500">
			{session.agent}
			{#if session.worktree}· {session.worktree.branch} · {session.worktree.path}{/if}
			· <span class={query.connected ? 'text-green-600' : 'text-red-600'}>●</span>
		</p>
	</header>

	<ol class="space-y-3">
		{#each session.transcript as item, i (i)}
			<li>
				{#if item.kind === 'user'}
					<div class="ml-12 rounded-lg bg-black p-3 whitespace-pre-wrap text-white">
						{item.text}
					</div>
				{:else if item.kind === 'text'}
					<div class="mr-12 rounded-lg bg-gray-100 p-3 whitespace-pre-wrap">{item.text}</div>
				{:else if item.kind === 'tool'}
					<details class="mr-12 rounded border font-mono text-xs">
						<summary class={['cursor-pointer p-2', item.isError && 'text-red-600']}>
							{item.output === null ? '⏳' : item.isError ? '✗' : '✓'}
							{item.name}
							<span class="text-gray-500">{item.input.slice(0, 100)}</span>
						</summary>
						<pre class="overflow-x-auto border-t p-2 whitespace-pre-wrap">{item.input}</pre>
						{#if item.output !== null}
							<pre
								class="overflow-x-auto border-t bg-gray-50 p-2 whitespace-pre-wrap">{item.output}</pre>
						{/if}
					</details>
				{:else if item.kind === 'error'}
					<div class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
						{item.error}
					</div>
				{/if}
			</li>
		{/each}
		{#if session.status === 'running'}
			<li class="text-sm text-gray-500">The agent is working…</li>
		{/if}
	</ol>

	<form {...sendMessage} class="space-y-2">
		<input {...sessionId.as('hidden', session.id)} />
		<textarea
			{...text.as('text')}
			rows="3"
			placeholder="Reply to the agent"
			class="w-full rounded border p-2"
			disabled={session.status === 'running'}></textarea>
		{#each text.issues() ?? [] as problem (problem.message)}
			<p class="text-sm text-red-600">{problem.message}</p>
		{/each}
		<div class="flex justify-end gap-2">
			{#if session.status === 'running'}
				<button
					type="button"
					class="rounded border px-4 py-2"
					onclick={() => stopSession(session.id)}>Stop</button
				>
			{/if}
			<button class="rounded bg-black px-4 py-2 text-white" disabled={session.status === 'running'}
				>Send</button
			>
		</div>
	</form>
</main>
