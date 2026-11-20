<script module lang="ts">
	export type ToolbarItem = {
		label: string;
		icon: string;
		/** Supply for toggle buttons. Omit for commands. */
		pressed?: boolean;
		onclick: () => void;
	};
</script>

<script lang="ts">
	import Button from './Button.svelte';

	let { label, items, status }: { label: string; items: ToolbarItem[]; status?: string } = $props();
	let focused = $state<string>();
	const tabStop = $derived(
		items.find((item) => item.label === focused) ?? items.find((item) => item.pressed) ?? items[0]
	);

	function navigate(event: KeyboardEvent) {
		const bar = event.currentTarget as HTMLElement;
		const buttons = Array.from(bar.querySelectorAll('button'));
		const index = buttons.indexOf(event.target as HTMLButtonElement);
		if (index < 0) return;
		let next: number;
		switch (event.key) {
			case 'ArrowLeft':
				next = (index + buttons.length - 1) % buttons.length;
				break;
			case 'ArrowRight':
				next = (index + 1) % buttons.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = buttons.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		buttons[next].focus();
	}
</script>

{#if items.length}
	<div
		role="toolbar"
		tabindex="-1"
		aria-label={label}
		onkeydown={navigate}
		class="mx-2 flex shrink-0 items-center gap-1 overflow-x-auto rounded-control bg-sunken/60 p-1"
	>
		{#each items as item (item.label)}
			<Button
				variant="ghost"
				size="sm"
				icon={item.icon}
				aria-pressed={item.pressed}
				tabindex={item === tabStop ? 0 : -1}
				onfocus={() => (focused = item.label)}
				onclick={item.onclick}
				class="px-2 aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-soft"
				>{item.label}</Button
			>
		{/each}
		{#if status}<span class="ml-auto pr-2 text-xs text-muted">{status}</span>{/if}
	</div>
{/if}
