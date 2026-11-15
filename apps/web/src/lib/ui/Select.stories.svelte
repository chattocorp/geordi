<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Select from './Select.svelte';

	const { Story } = defineMeta({ title: 'UI/Select', component: Select });

	const sizes = [
		{ value: '', label: 'Default size' },
		{ value: 's', label: 'Small' },
		{ value: 'l', label: 'Large' }
	];
	// enough to scroll, with IDs to find them by
	const models = [
		{ value: '', label: 'Default model' },
		...['Sol', 'Astra', 'Terra', 'Luna', 'Nova', 'Vega', 'Lyra', 'Orion', 'Rigel', 'Altair'].map(
			(name) => ({ value: name, label: `GPT-6-${name}`, hint: `gpt-6-${name.toLowerCase()}` })
		)
	];
</script>

<script lang="ts">
	let size = $state('');
	let other = $state('l');
	let model = $state('Luna');
</script>

<Story name="Default and chosen" asChild>
	<div class="flex flex-wrap items-center gap-3">
		<Select label="Size" options={sizes} bind:value={size} />
		<Select label="Size" options={sizes} bind:value={other}>
			{#snippet leading()}<span class="icon-[lucide--ruler] size-3.5"></span>{/snippet}
		</Select>
	</div>
</Story>

<Story name="Many options, with hints" asChild>
	<Select label="Model" options={models} bind:value={model} />
</Story>
