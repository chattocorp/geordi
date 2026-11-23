<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		icon,
		href,
		current = false,
		hint,
		fold,
		onpoint,
		class: extraClass
	}: {
		title: string;
		icon?: Snippet;
		href?: string;
		current?: boolean;
		hint?: string;
		/** `unread`: something folded away is unread, which the count then shows. */
		fold?: { folded: boolean; count: number; unread?: boolean; toggle(): void };
		onpoint?: (pointed: boolean) => void;
		class?: string;
	} = $props();

	const labelClass = $derived(['flex min-w-0 flex-1 items-center gap-2 px-1.5', extraClass]);
	const toggleLabel = $derived(`${fold?.folded ? 'Expand' : 'Collapse'} ${title}`);
</script>

{#snippet label()}
	{#if icon}
		<span class="grid size-5 shrink-0 place-items-center text-muted">
			<span class={['col-start-1 row-start-1 grid place-items-center', fold && 'reveal:opacity-0']}>
				{@render icon()}
			</span>
			{#if fold}
				<span
					class={[
						'pointer-events-none col-start-1 row-start-1 size-4 opacity-0 reveal:opacity-100',
						fold.folded ? 'icon-[lucide--chevron-right]' : 'icon-[lucide--chevron-down]'
					]}
				></span>
			{/if}
		</span>
	{/if}
	<span class="min-w-0 truncate">{title}</span>
	{#if fold?.folded}
		<span
			aria-hidden="true"
			class={[
				'shrink-0 tabular-nums',
				fold.unread ? 'font-semibold text-ink' : 'font-normal text-faint'
			]}
		>
			{fold.count}
		</span>
	{/if}
{/snippet}

{#if href}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved URLs -->
	<a
		{href}
		class={labelClass}
		draggable="false"
		aria-current={current ? 'page' : undefined}
		title={hint}
		onpointerenter={() => onpoint?.(true)}
		onpointerleave={() => onpoint?.(false)}
		onfocus={() => onpoint?.(true)}
		onblur={() => onpoint?.(false)}
	>
		{@render label()}
	</a>
	{#if fold}
		<button
			type="button"
			class="absolute top-1/2 left-1.5 size-5 -translate-y-1/2 rounded-control"
			aria-label={toggleLabel}
			aria-expanded={!fold.folded}
			title={toggleLabel}
			onclick={fold.toggle}
		></button>
	{/if}
{:else if fold}
	<button
		type="button"
		class={labelClass}
		aria-label={toggleLabel}
		aria-expanded={!fold.folded}
		onclick={fold.toggle}
	>
		{@render label()}
	</button>
{:else}
	<span class={labelClass} aria-current={current ? true : undefined}>{@render label()}</span>
{/if}
