<script lang="ts">
	import { contextMenus, type MenuItem, type MenuTone } from './menu.svelte.ts';

	const tones: Record<MenuTone, string> = {
		danger: 'text-danger focus:text-danger',
		accent: 'text-accent-ink focus:text-accent-ink',
		ok: 'text-ok focus:text-ok',
		merged: 'text-merged focus:text-merged'
	};

	let popup: HTMLDivElement;
	const open = $derived(contextMenus.open);

	const enabled = () => [
		...popup.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)')
	];

	// Show it where it was asked for, moved inwards where it would leave the window.
	$effect(() => {
		if (!open) return;
		if (!popup.matches(':popover-open')) popup.showPopover();
		const left = Math.max(8, Math.min(open.x, innerWidth - popup.offsetWidth - 8));
		const top = Math.max(8, Math.min(open.y, innerHeight - popup.offsetHeight - 8));
		popup.style.left = `${left}px`;
		popup.style.top = `${top}px`;
		enabled()[0]?.focus();
	});

	function select(item: Exclude<MenuItem, 'separator'>) {
		popup.hidePopover();
		item.onselect();
	}

	function onkeydown(event: KeyboardEvent) {
		const items = enabled();
		const at = items.indexOf(document.activeElement as HTMLButtonElement);
		const to = {
			ArrowDown: (at + 1) % items.length,
			ArrowUp: (at - 1 + items.length) % items.length,
			Home: 0,
			End: items.length - 1
		}[event.key];
		if (event.key === 'Tab') popup.hidePopover();
		if (to === undefined) return;
		event.preventDefault();
		items[to]?.focus();
	}
</script>

<!-- The menu goes when the page changes shape under it. -->
<svelte:window onresize={() => open && popup.hidePopover()} />

<!--
	Shows the context menus that `contextMenu` attachments ask for. Render it once, in the
	layout. Arrow keys move, Enter picks, Escape or a click elsewhere closes.
-->
<div
	bind:this={popup}
	popover="auto"
	role="menu"
	tabindex="-1"
	{onkeydown}
	ontoggle={(event) => event.newState === 'closed' && (contextMenus.open = null)}
	oncontextmenu={(event) => event.preventDefault()}
	style="inset: auto"
	class="m-0 min-w-48 card-float p-2 text-ink"
>
	{#each open?.items ?? [] as item, index (index)}
		{#if item === 'separator'}
			<hr class="my-1 border-line" />
		{:else}
			<button
				type="button"
				role="menuitem"
				disabled={item.disabled}
				onclick={() => select(item)}
				onpointermove={(event) => event.currentTarget.focus()}
				class={[
					'menu-item focus:menu-item-active focus:outline-none disabled:opacity-50',
					item.tone && tones[item.tone]
				]}
			>
				{#if item.icon}<span class={['size-4 shrink-0', item.icon]}></span>{/if}
				{item.label}
			</button>
		{/if}
	{/each}
</div>
