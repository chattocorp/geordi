<script lang="ts">
	type Props = {
		repos: { id: string; name: string }[];
		/** Attributes for each radio input, e.g. from a remote form field. */
		attributes: (repoId: string) => Record<string, unknown>;
	};
	let { repos, attributes }: Props = $props();
</script>

<fieldset class="flex flex-wrap gap-1.5">
	<legend class="sr-only">Repository</legend>
	{#each repos as repo (repo.id)}
		<label class="choice pl-2.5">
			<input {...attributes(repo.id)} class="sr-only" />
			<span class="icon-[lucide--folder-git-2] size-4 shrink-0"></span>
			{repo.name}
		</label>
	{/each}
</fieldset>
