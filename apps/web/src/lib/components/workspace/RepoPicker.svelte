<script lang="ts" module>
	/** What the picker offers besides repositories: a new project, in none (FDR-012). */
	export const PROJECT = '';
</script>

<script lang="ts">
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import Select from '#lib/ui/Select.svelte';

	let {
		repos,
		onadd,
		value = $bindable(),
		open = $bindable(false)
	}: {
		repos: { id: string; name: string }[];
		/** A repository's ID, or `PROJECT`. */
		value: string;
		open?: boolean;
		onadd: () => void;
	} = $props();

	const options = $derived([
		...repos.map((repo) => ({ value: repo.id, label: repo.name })),
		{ value: PROJECT, label: 'New project' },
		{ value: ':add', label: 'Add repository…' }
	]);
	const selected = $derived(options.find((option) => option.value === value));
</script>

<Select
	label="Repository"
	{options}
	bind:value={
		() => value,
		(id) => {
			if (id === ':add') onadd();
			else if (id !== undefined) value = id;
		}
	}
	bind:open
>
	{#snippet trigger()}
		{#if selected}
			{#key selected.value}{@render iconOf(selected.value)}{/key}
			<span class="truncate text-ink">{selected.label}</span>
		{/if}
	{/snippet}
	{#snippet icon(option)}
		{@render iconOf(option.value)}
	{/snippet}
</Select>

{#snippet iconOf(id: string)}
	{#if id === ':add'}
		<span class="grid size-5 place-items-center"
			><span class="icon-[lucide--plus] size-4 text-muted"></span></span
		>
	{:else if id === PROJECT}
		<span class="grid size-5 shrink-0 place-items-center">
			<span class="icon-[lucide--folder-plus] size-4.5 text-muted/70"></span>
		</span>
	{:else}
		<RepoIcon {id} />
	{/if}
{/snippet}
