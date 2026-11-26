<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import { hint } from '@geordi/ui/keys';

	let { open, onclick }: { open: boolean; onclick: () => void } = $props();
</script>

<div
	class="fixed top-0 left-0 z-10 hidden h-14 items-center bg-frame pl-5 window-drag md:flex mac:pl-22"
>
	<Button
		variant="ghost"
		icon={open ? 'icon-[lucide--panel-left-close]' : 'icon-[lucide--panel-left-open]'}
		label={`${open ? 'Hide' : 'Show'} sidebar (${hint('toggleSidebar')})`}
		aria-expanded={open}
		{onclick}
	/>
</div>
