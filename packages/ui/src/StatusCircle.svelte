<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { WorkspaceStanding } from './actions.ts';

	/** How a workspace stands or what is under way in it: one icon in a circle of its tone. */
	let {
		tone = 'neutral',
		label,
		children
	}: { tone?: WorkspaceStanding['tone']; label: string; children: Snippet } = $props();

	const tones = {
		ok: 'status-ok',
		danger: 'status-danger',
		accent: 'status-accent',
		merged: 'status-merged',
		neutral: 'status-neutral'
	};
</script>

<span
	role="img"
	aria-label={label}
	title={label}
	class={['relative grid size-6 shrink-0 place-items-center rounded-full', tones[tone]]}
>
	{@render children()}
</span>
