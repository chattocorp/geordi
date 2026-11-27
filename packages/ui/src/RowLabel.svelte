<script lang="ts">
	import type { Snippet } from 'svelte';
	import PictureIcon from './PictureIcon.svelte';

	/**
	 * The label of a row in a list: a cell for its sign, then its title. A row with rows folded
	 * under it (a repository in the sidebar, a group of tasks, a section of changes) folds them
	 * from here: its sign gives way to a chevron (where it has no sign, the chevron is its
	 * sign), and folded, the title is followed by how many rows it holds. The cell is as wide
	 * as the cells of the rows under it, so that their signs line up. A label that only folds
	 * (no link of its own) is a group's heading: muted beside the rows under it, its count fainter.
	 */
	let {
		title,
		icon,
		picture,
		href,
		current = false,
		hint,
		fold,
		onpoint,
		children,
		chevron = true,
		class: extraClass
	}: {
		title: string;
		icon?: Snippet;
		/** A picture to show as its sign, where it has no `icon`: where it can't be shown, none. */
		picture?: string;
		href?: string;
		current?: boolean;
		hint?: string;
		/** `unread`: something folded away is unread, which the count then shows. */
		fold?: { folded: boolean; count: number; unread?: boolean; toggle(): void };
		onpoint?: (pointed: boolean) => void;
		/** What follows the title (and the count): what it still says when folded. */
		children?: Snippet;
		/** Whether it folds from its sign; else the caller folds it from elsewhere (the outline, from beside it), and it only says how many are folded away. */
		chevron?: boolean;
		class?: string;
	} = $props();

	/** A heading's sign takes its colour; a row's sign is muted beside its title. */
	const heading = $derived(!!fold && !href);
	const labelClass = $derived([
		'flex min-w-0 flex-1 items-center gap-1 px-1',
		heading && 'text-muted hover:text-ink',
		extraClass
	]);
	let pictureFailed = $state(false);
	// another picture may well be shown
	$effect.pre(() => {
		void picture;
		pictureFailed = false;
	});
	/** What it has for a sign, if anything; else the chevron is its sign. */
	const signed = $derived(!!icon || (!!picture && !pictureFailed));
	const toggleLabel = $derived(`${fold?.folded ? 'Expand' : 'Collapse'} ${title}`);
</script>

{#snippet chevronSign(always: boolean)}
	<span
		aria-hidden="true"
		class={[
			'pointer-events-none col-start-1 row-start-1 icon-[lucide--chevron-right] size-4 transition-transform motion-reduce:transition-none',
			!fold?.folded && 'rotate-90',
			!always && 'opacity-0 reveal:opacity-100'
		]}
	></span>
{/snippet}

{#snippet label()}
	{#if icon || picture || fold}
		<span class={['grid size-6 shrink-0 place-items-center', !heading && 'text-muted']}>
			{#if icon || (picture && !pictureFailed)}
				<span
					class={[
						'col-start-1 row-start-1 grid place-items-center',
						fold && chevron && 'reveal:opacity-0'
					]}
				>
					{#if icon}{@render icon()}{:else if picture}<PictureIcon
							src={picture}
							bind:failed={pictureFailed}
						/>{/if}
				</span>
			{/if}
			{#if fold && chevron}{@render chevronSign(!signed)}{/if}
		</span>
	{/if}
	<span class="min-w-0 truncate">{title}</span>
	{#if fold?.folded}
		<span
			aria-hidden="true"
			class={[
				'shrink-0 pl-1 tabular-nums',
				fold.unread ? 'font-semibold text-ink' : 'font-normal text-faint'
			]}
		>
			{fold.count}
		</span>
	{/if}
	{@render children?.()}
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
	{#if fold && chevron}
		<!-- the link goes to it; its sign, become a chevron, folds what is under it -->
		<button
			type="button"
			class="absolute top-1/2 left-1 size-6 -translate-y-1/2 rounded-control"
			aria-label={toggleLabel}
			aria-expanded={!fold.folded}
			title={toggleLabel}
			onclick={fold.toggle}
		></button>
	{/if}
{:else if fold}
	<!-- named by what it says (its title, and what still shows when folded, such as a task at
	     work); whether it is open, `aria-expanded` says -->
	<button
		type="button"
		class={labelClass}
		aria-expanded={!fold.folded}
		title={hint}
		onclick={fold.toggle}
	>
		{@render label()}
	</button>
{:else}
	<span class={labelClass} aria-current={current ? true : undefined}>{@render label()}</span>
{/if}
