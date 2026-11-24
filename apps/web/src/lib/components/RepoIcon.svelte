<script lang="ts">
	import { resolve } from '$app/paths';
	import PictureIcon from '@geordi/ui/PictureIcon.svelte';
	import { daemon } from '#lib/daemon.svelte.ts';
	import { monogram, tint } from './repo-icon.ts';

	/**
	 * What stands for a repository beside its name: the picture it has of itself (a favicon,
	 * a logo), where it has one; its initial on a colour of its own where it has none; a folder until that is known.
	 */
	let { id, name, small = false }: { id: string; name: string; small?: boolean } = $props();

	let failed = $state(false);
	/**
	 * Asked once; asked again, where that found nothing, each time a daemon connects: no
	 * daemon may have been there to say, the first time.
	 */
	const src = $derived(
		resolve('/repos/[id]/icon', { id }) + (failed ? `?daemon=${daemon.connections}` : '')
	);
</script>

<PictureIcon {src} {small} bind:failed>
	{#snippet fallback(didFail)}
		{#if didFail}<span
				aria-hidden="true"
				class="grid size-full place-items-center rounded-control text-xs font-semibold"
				style:background-color="var(--tint-{tint(id)})"
				style:color="var(--tint-{tint(id)}-ink)"
			>
				{monogram(name)}
			</span>{:else}<span
				class={['icon-[lucide--folder-git-2] text-faint', small ? 'size-4' : 'size-4.5']}
			></span>{/if}
	{/snippet}
</PictureIcon>
