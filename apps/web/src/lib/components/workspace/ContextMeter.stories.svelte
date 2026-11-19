<script module lang="ts">
	import { expect, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ContextMeter from './ContextMeter.svelte';

	const { Story } = defineMeta({ title: 'Geordi/ContextMeter', component: ContextMeter });
</script>

<Story
	name="Claude, with its cost"
	args={{ usage: { used: 312_000, size: 1_000_000, cost: { amount: 0.2673511, currency: 'USD' } } }}
	play={async ({ canvasElement }) => {
		const ring = within(canvasElement).getByRole('img');
		await expect(ring).toHaveAccessibleName('Context: 312k of 1M tokens · $0.27');
	}}
/>

<Story name="Codex" args={{ usage: { used: 19_711, size: 258_400 } }} />

<Story name="Nearly full" args={{ usage: { used: 240_000, size: 258_400 } }} />
