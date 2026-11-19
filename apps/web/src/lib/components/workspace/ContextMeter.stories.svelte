<script module lang="ts">
	import { expect, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ContextMeter from './ContextMeter.svelte';

	const { Story } = defineMeta({ title: 'Geordi/ContextMeter', component: ContextMeter });
</script>

<Story
	name="Claude, with its cost"
	args={{
		agent: 'claude',
		usage: { used: 312_000, size: 1_000_000, cost: { amount: 0.2673511, currency: 'USD' } }
	}}
	play={async ({ canvasElement }) => {
		const ring = within(canvasElement).getByRole('img');
		await expect(ring).toHaveAccessibleName('Context: 312k of 1M tokens · $0.27');
	}}
/>

<Story name="Codex" args={{ agent: 'codex', usage: { used: 19_711, size: 258_400 } }} />

<Story
	name="With usage limits"
	args={{
		agent: 'claude',
		usage: { used: 312_000, size: 1_000_000 },
		limits: [
			{ name: '5h', usedPercent: 11, resetsAt: Date.now() + 2 * 60 * 60_000, status: 'ok' },
			{ name: 'Week', usedPercent: 77, resetsAt: Date.now() + 3 * 86_400_000, status: 'warning' },
			{ name: 'Fable', usedPercent: 100, resetsAt: Date.now() + 3 * 86_400_000, status: 'limited' }
		]
	}}
	play={async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole('tooltip', { hidden: true })).toHaveTextContent(
			'Claude Code usage limits'
		);
	}}
/>

<Story name="Nearly full" args={{ agent: 'codex', usage: { used: 240_000, size: 258_400 } }} />
