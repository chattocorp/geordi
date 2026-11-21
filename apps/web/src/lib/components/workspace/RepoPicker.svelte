<script lang="ts">
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import Select from '#lib/ui/Select.svelte';

	/**
	 * The one way to choose a repository: by name, in alphabetical order, each with its
	 * picture. `all` offers "none in particular" first (value `''`), `onadd` adding one last.
	 */
	let {
		repos,
		onadd,
		all,
		title,
		buttonIcon = true,
		value = $bindable(),
		open = $bindable(false)
	}: {
		repos: { id: string; name: string }[];
		/** A repository's ID, or `''` for `all`. */
		value: string;
		open?: boolean;
		title?: string;
		/** Whether the button shows the chosen repository's picture too, not just its name. */
		buttonIcon?: boolean;
		/** The label of the option for all repositories, if there is one. */
		all?: string;
		onadd?: () => void;
	} = $props();

	const ADD = ':add';

	const options = $derived([
		...(all ? [{ value: '', label: all }] : []),
		...repos
			.toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
			.map((repo) => ({ value: repo.id, label: repo.name })),
		...(onadd ? [{ value: ADD, label: 'Add repository…' }] : [])
	]);
	const selected = $derived(options.find((option) => option.value === value) ?? options[0]);
</script>

<Select
	label="Repository"
	{title}
	{options}
	bind:value={
		() => value,
		(id) => {
			if (id === ADD) onadd?.();
			else if (id !== undefined) value = id;
		}
	}
	bind:open
>
	{#snippet trigger()}
		{#if selected}
			{#if buttonIcon}{#key selected.value}{@render iconOf(selected.value)}{/key}{/if}
			<span class="truncate text-ink">{selected.label}</span>
		{/if}
	{/snippet}
	{#snippet icon(option)}
		{@render iconOf(option.value)}
	{/snippet}
</Select>

{#snippet iconOf(id: string)}
	{#if id === ADD || id === ''}
		<span class="grid size-5 place-items-center">
			<span
				class={['size-4 text-muted', id === ADD ? 'icon-[lucide--plus]' : 'icon-[lucide--layers]']}
			></span>
		</span>
	{:else}
		<RepoIcon {id} />
	{/if}
{/snippet}
