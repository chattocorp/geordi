<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Steps from './Steps.svelte';

	const { Story } = defineMeta({ title: 'UI/Steps', component: Steps });

	const levels = ['Off', 'Low', 'Medium', 'High', 'Max'].map((label) => ({ value: label, label }));
</script>

<script lang="ts">
	let level = $state('Medium');
</script>

<Story name="Levels" asChild>
	<div class="flex items-center gap-3 text-sm">
		<Steps label="Level" steps={levels} bind:value={level} />
		<span class="text-muted">{level}</span>
	</div>
</Story>
