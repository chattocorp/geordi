<script lang="ts">
	import RepoIcon from '#lib/components/RepoIcon.svelte';
	import Select from '#lib/ui/Select.svelte';

	let {
		repos,
		value = $bindable(),
		open = $bindable(false)
	}: {
		repos: { id: string; name: string }[];
		value: string;
		open?: boolean;
	} = $props();

	const options = $derived(repos.map((repo) => ({ value: repo.id, label: repo.name })));
	const selected = $derived(options.find((option) => option.value === value));
</script>

<Select label="Repository" {options} bind:value bind:open>
	{#snippet trigger()}
		{#if selected}
			{#key selected.value}<RepoIcon id={selected.value} />{/key}
			<span class="truncate text-ink">{selected.label}</span>
		{/if}
	{/snippet}
	{#snippet icon(option)}
		<RepoIcon id={option.value} />
	{/snippet}
</Select>
