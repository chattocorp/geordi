<script lang="ts" generics="T extends string">
	type Props = {
		/** What is being chosen, for those who can't see it. */
		label: string;
		value: T;
		options: { value: T; label: string; icon?: string }[];
	};
	let { label, value = $bindable(), options }: Props = $props();
</script>

<!-- One of a few, all in view: for two to four choices. More than that wants a `Select`. -->
<div
	role="radiogroup"
	aria-label={label}
	class="inline-flex rounded-full bg-sunken p-0.5 ring-1 ring-line"
>
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={option.value === value}
			onclick={() => (value = option.value)}
			class={[
				'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium',
				option.value === value ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink'
			]}
		>
			{#if option.icon}<span class={[option.icon, 'size-4']}></span>{/if}
			{option.label}
		</button>
	{/each}
</div>
