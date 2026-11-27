<script module lang="ts">
	import { expect, within } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ReplyComposer from '@geordi/ui/ReplyComposer.svelte';
	import Select from '#lib/ui/Select.svelte';
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
		const signal = within(canvasElement).getByRole('img', { name: /Context/ });
		await expect(signal).toHaveAccessibleName('Context: 312k of 1M tokens · $0.27');
	}}
/>

<Story name="Codex" args={{ agent: 'codex', usage: { used: 19_711, size: 258_400 } }} />

<Story
	name="With usage limits"
	args={{
		agent: 'claude',
		model: 'sonnet',
		usage: { used: 312_000, size: 1_000_000 },
		limits: [
			{
				name: '5h',
				minutes: 300,
				usedPercent: 11,
				resetsAt: Date.now() + 2 * 60 * 60_000,
				status: 'ok'
			},
			{
				name: 'Week',
				minutes: 10_080,
				usedPercent: 77,
				resetsAt: Date.now() + 3 * 86_400_000,
				status: 'warning'
			},
			{
				name: 'Week (Opus)',
				minutes: 10_080,
				usedPercent: 100,
				resetsAt: Date.now() + 3 * 86_400_000,
				status: 'limited'
			}
		]
	}}
	play={async ({ canvasElement }) => {
		// Claude's battery is its five-hour window; the weeks are in the tooltip
		await expect(within(canvasElement).getByRole('img', { name: /usage/ })).toHaveAccessibleName(
			'Claude Code usage: 89% left'
		);
		await expect(within(canvasElement).getByRole('tooltip', { hidden: true })).toHaveTextContent(
			'Week (Opus)'
		);
	}}
/>

<Story
	name="Getting low"
	args={{
		agent: 'claude',
		usage: { used: 750_000, size: 1_000_000 },
		limits: [
			{ name: '5h', minutes: 300, usedPercent: 40, status: 'ok' },
			{ name: 'Week', minutes: 10_080, usedPercent: 75, status: 'ok' }
		]
	}}
/>

<!-- before the agent says how full its context is, the limits it shares with others show -->
<Story
	name="Before the context is known"
	args={{
		agent: 'claude',
		limits: [{ name: 'Week', minutes: 10_080, usedPercent: 92, status: 'warning' }]
	}}
/>

<!-- a full context keeps one bar, in red -->
<Story name="Full" args={{ agent: 'codex', usage: { used: 258_400, size: 258_400 } }} />

<Story name="Nearly full" args={{ agent: 'codex', usage: { used: 240_000, size: 258_400 } }} />

<Story
	name="Running low"
	args={{
		agent: 'codex',
		usage: { used: 240_000, size: 258_400 },
		limits: [{ name: 'Week', minutes: 10_080, usedPercent: 94, status: 'warning' }]
	}}
/>

<!-- where it is seen: beside the pickers in the reply box, whose looks it must match -->
<Story name="In the composer" asChild>
	<div class="max-w-2xl">
		<ReplyComposer
			form={{ onsubmit: (event: SubmitEvent) => event.preventDefault() }}
			onstop={() => {}}
		>
			{#snippet options()}
				<Select label="Model" value="opus" options={[{ value: 'opus', label: 'Opus' }]} />
				<Select label="Effort" value="medium" options={[{ value: 'medium', label: 'Medium' }]} />
				<Select
					label="Permission mode"
					value="sandboxed"
					options={[{ value: 'sandboxed', label: 'Full Permissions (Sandboxed)' }]}
				>
					{#snippet icon()}
						<span aria-hidden="true" class="icon-[lucide--shield-check] size-4 shrink-0"></span>
					{/snippet}
				</Select>
			{/snippet}
			{#snippet meter()}
				<ContextMeter
					agent="claude"
					usage={{ used: 70_000, size: 1_000_000 }}
					limits={[{ name: '5h', minutes: 300, usedPercent: 35, status: 'ok' }]}
				/>
			{/snippet}
		</ReplyComposer>
	</div>
</Story>
