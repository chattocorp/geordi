<script lang="ts">
	import { untrack } from 'svelte';
	import Select from '#lib/ui/Select.svelte';
	import { listBranches } from '../../../routes/workspaces.remote';

	/**
	 * The one way to choose a branch of a repository: to start a worktree from, or to compare
	 * one with. The branch work starts from comes first (value `''`), then the others, the most
	 * recently committed to first. They are asked for again each time the list is opened:
	 * branches come and go.
	 */
	let {
		repoId,
		value = $bindable(''),
		main,
		title,
		label = 'Branch',
		icon = 'icon-[lucide--git-branch]',
		without,
		shortcut
	}: {
		repoId: string;
		/** A branch's name, or `''` for the one work starts from. */
		value: string;
		/** What to call the branch work starts from until the repository says. */
		main?: string;
		title?: string;
		/** What is being chosen; read out, not shown. */
		label?: string;
		/** The sign before the name. */
		icon?: string;
		/** A branch not to offer: a worktree's own, which it can't be compared with. */
		without?: string;
		/** A keyboard shortcut that opens and focuses it. */
		shortcut?: (event: KeyboardEvent, button: HTMLElement) => boolean;
	} = $props();

	let found = $state<{ repoId: string; start: string | null; branches: string[] } | null>(null);
	let open = $state(false);

	function load() {
		const id = repoId;
		// (a command counts what is pending: read here, that would have this run again, and again)
		untrack(() => listBranches(id)).then(
			(branches) => {
				if (id === repoId) found = { repoId: id, ...branches };
			},
			// nobody to ask (no daemon): what is chosen stays, and nothing else is offered
			() => {}
		);
	}
	$effect(load);

	const known = $derived(found?.repoId === repoId ? found : null);
	const start = $derived(known?.start ?? main);
	const options = $derived([
		...(start ? [{ value: '', label: start }] : []),
		...(known?.branches ?? [])
			.filter((branch) => branch !== known?.start && branch !== without)
			.map((branch) => ({ value: branch, label: branch })),
		// one chosen before is still what it is, listed or not
		...(value && !known?.branches.includes(value) ? [{ value, label: value }] : [])
	]);
</script>

{#if options.length > 0}
	<Select
		{label}
		{title}
		{shortcut}
		{options}
		bind:value
		bind:open={
			() => open,
			(next) => {
				open = next;
				if (next) load();
			}
		}
	>
		{#snippet trigger()}
			<span class={[icon, 'size-3.5 shrink-0']}></span>
			<span class="truncate text-ink">{value || start}</span>
		{/snippet}
	</Select>
{/if}
