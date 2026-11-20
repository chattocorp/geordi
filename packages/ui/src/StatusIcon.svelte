<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { WorkspaceStanding } from './actions.ts';

	/** A passive status uses foreground colour and sits directly on its surrounding surface. */
	let {
		tone = 'neutral',
		label,
		children
	}: { tone?: WorkspaceStanding['tone']; label: string; children: Snippet } = $props();

	const tones = {
		ok: 'text-ok',
		danger: 'text-danger',
		accent: 'text-accent-ink',
		merged: 'text-merged',
		neutral: 'text-muted'
	};
</script>

<span
	role="img"
	aria-label={label}
	title={label}
	class={['relative grid size-6 shrink-0 place-items-center', tones[tone]]}
>
	{@render children()}
</span>
