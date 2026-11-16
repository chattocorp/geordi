<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ReleasePlan } from '@geordi/protocol';
	import Changeset from './Changeset.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Changeset', component: Changeset });

	const plan: ReleasePlan = {
		tool: 'sweet-release',
		name: 'Sweet Release',
		problem: null,
		packages: [
			{
				path: 'apps/api',
				name: 'API',
				version: '1.2.3',
				bump: 'minor',
				nextVersion: '1.3.0',
				problems: [],
				notes: [
					{
						path: 'apps/api/.sweet/jade-early-willow.md',
						type: 'feature',
						breaking: false,
						body: 'Accept plain-HTTP client IDs on loopback hosts, for development.',
						added: true
					},
					{
						path: 'apps/api/.sweet/blue-calm-river.md',
						type: 'fix',
						breaking: false,
						body: 'Keep changelog source attribution inline after the final paragraph.',
						added: false
					}
				]
			},
			{
				path: 'apps/web',
				name: null,
				version: '0.9.0',
				bump: 'major',
				nextVersion: '1.0.0',
				problems: [],
				notes: [
					{
						path: 'apps/web/.sweet/quiet-early-dawn.md',
						type: 'feature',
						breaking: true,
						body: 'Drop the old login page.',
						added: false
					}
				]
			}
		]
	};
	const onopen = () => {};
</script>

{#snippet pane(plan: ReleasePlan)}
	<div class="flex h-96 w-96 flex-col overflow-hidden card"><Changeset {plan} {onopen} /></div>
{/snippet}

<Story name="Notes of this workspace, and what was pending" asChild>{@render pane(plan)}</Story>

<Story name="No notes yet" asChild>
	{@render pane({
		...plan,
		packages: plan.packages.map((pkg) => ({ ...pkg, notes: [], nextVersion: null }))
	})}
</Story>

<Story name="The tool is not there" asChild>
	{@render pane({ ...plan, packages: [], problem: 'sweet is not installed on this machine' })}
</Story>
