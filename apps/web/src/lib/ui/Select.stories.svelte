<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Select from './Select.svelte';
	import { pressed } from '@geordi/ui/keys';

	const { Story } = defineMeta({ title: 'UI/Select', component: Select });

	const sizes = [
		{ value: 's', label: 'Small' },
		{ value: 'm', label: 'Medium' },
		{ value: 'l', label: 'Large' }
	];
	// enough to scroll, and some found by words that aren't shown
	const stars = [
		...['Sol', 'Astra', 'Terra', 'Luna', 'Nova', 'Vega'].map((name) => ({
			value: name,
			label: name,
			keywords: 'near close'
		})),
		...['Lyra', 'Orion', 'Rigel', 'Altair', 'Deneb', 'Sirius'].map((name) => ({
			value: name,
			label: name
		}))
	];
</script>

<script lang="ts">
	let size = $state('m');
	let own = $state('XXL');
	let star = $state('Luna');
</script>

<Story name="A few options" asChild>
	<Select label="Size" options={sizes} bind:value={size} />
</Story>

<Story name="Anything typed may be chosen" asChild>
	<Select
		label="Size"
		options={[
			...sizes,
			...(sizes.some((s) => s.value === own) ? [] : [{ value: own, label: own }])
		]}
		bind:value={own}
		create={(typed) => [{ value: typed, label: `Use “${typed}”` }]}
	/>
</Story>

<Story name="Many options, with icons" asChild>
	<Select label="Star" options={stars} bind:value={star}>
		{#snippet icon()}<span class="icon-[lucide--star] size-3.5 shrink-0"></span>{/snippet}
	</Select>
</Story>

<Story name="Opened with Ctrl or Cmd Shift N" asChild>
	<Select
		label="Size"
		options={sizes}
		bind:value={size}
		shortcut={(event) => pressed(event, 'newWorkspaceIn')}
	/>
</Story>
