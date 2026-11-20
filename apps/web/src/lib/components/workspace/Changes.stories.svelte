<script module lang="ts">
	import { expect, fn, waitFor } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Panes from '#lib/ui/Panes.svelte';
	import DiffView from '@geordi/ui/DiffView.svelte';
	import { open, singleGroup, type Layout } from '#lib/layout.ts';
	import Changes from '@geordi/ui/Changes.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Changes', component: Changes });
	const versions: Record<string, [string, string]> = {
		'src/index.ts': [
			"export { format } from './format';\n",
			"export { formatLabel } from './format';\n"
		],
		'src/format.ts': [
			'export const format = (name: string) => name;\n',
			'export const formatLabel = (name: string) => name.trim();\n'
		]
	};
	const pending = {
		changes: null,
		unavailable: null,
		missing: false,
		upstream: null,
		config: null,
		release: null
	};
</script>

<script lang="ts">
	let selected = $state('');
	let layout = $state.raw<Layout>(singleGroup(['Conversation']));
</script>

<Story
	name="Switch files in one diff tab"
	asChild
	play={async ({ canvas, userEvent }) => {
		for (const name of ['index.ts', 'format.ts']) {
			await userEvent.click(canvas.getByRole('button', { name: new RegExp(name) }));
			await expect(canvas.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
			await expect(canvas.getAllByRole('tab')).toHaveLength(2);
		}
	}}
>
	<div class="grid h-80 grid-cols-3 gap-2 bg-frame p-2">
		<div class="col-span-2 flex sheet overflow-hidden">
			<Panes {layout} onchange={(next) => (layout = next)} closable={(id) => id === 'diff'}>
				{#snippet tab(id: string)}
					{@const path = id === 'diff' ? selected : undefined}
					{#if path}
						<span class="icon-[lucide--file-diff] size-3.5"></span>
						<span class="code-dense" title={path}>{path.split('/').at(-1)}</span>
					{:else}
						{id}
					{/if}
				{/snippet}
				{#snippet window(id: string)}
					{@const path = id === 'diff' ? selected : undefined}
					{#if path}
						<DiffView {path} old={versions[path][0]} new={versions[path][1]} />
					{/if}
				{/snippet}
			</Panes>
		</div>
		<div class="sheet-quiet">
			<Changes
				git={{
					...pending,
					changes: {
						branch: 'feature',
						comparisonTarget: 'main',
						uncommitted: 2,
						unpushed: null,
						landed: false,
						files: Object.keys(versions).map((path) => ({
							path,
							status: 'modified',
							added: 1,
							removed: 1
						}))
					}
				}}
				onopen={(path) => {
					selected = path;
					layout = open(layout, 'diff');
				}}
			/>
		</div>
	</div>
</Story>

<Story
	name="Waiting for local Git"
	args={{ git: pending, onopen: fn() }}
	play={async ({ canvas }) => {
		await expect(canvas.getByText('Loading…')).toBeVisible();
	}}
/>

<Story
	name="Open a file while upstream is pending"
	args={{
		git: {
			...pending,
			changes: {
				branch: 'feature',
				comparisonTarget: 'main',
				uncommitted: 1,
				unpushed: null,
				landed: false,
				files: [{ path: 'message.txt', status: 'modified', added: 1, removed: 1 }]
			}
		},
		onopen: fn()
	}}
	play={async ({ canvas, userEvent, args }) => {
		await expect(canvas.getByText('main')).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: /message.txt/ }));
		await expect(args.onopen).toHaveBeenCalledWith('message.txt');
	}}
/>

<Story name="Long paths in a narrow pane" asChild>
	<div class="w-80">
		<Changes
			git={{
				...pending,
				changes: {
					branch: 'feature',
					comparisonTarget: 'main',
					uncommitted: 0,
					unpushed: null,
					landed: false,
					files: [
						{
							path: 'docs/adr/ADR-124-atproto-handle-verification-needs-an-issuer.md',
							status: 'modified',
							added: 7,
							removed: 4
						},
						{
							path: 'docs/adr/very/deeply/nested/directories/INDEX.md',
							status: 'modified',
							added: 2,
							removed: 1
						},
						{ path: 'docs/GLOSSARY.md', status: 'modified', added: 3, removed: 1 },
						{ path: 'src/middleware/WindowWidths.ts', status: 'added', added: 18, removed: 0 }
					]
				}
			}}
			onopen={() => {}}
		/>
	</div>
</Story>

<Story
	name="Fold directories in the tree"
	asChild
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('radio', { name: 'As a tree' }));
		const nested = canvas.getByRole('button', { name: 'very/deeply/nested/directories' });
		await expect(nested).toHaveAttribute('aria-expanded', 'true');
		await expect(nested).toHaveTextContent('directories');
		await waitFor(() => expect(nested).toHaveTextContent(/^v\/.*directories$/));
		await expect(nested).toHaveStyle({ fontSize: '15px' });
		await expect(canvas.getByRole('button', { name: /INDEX\.md/ })).toBeVisible();
		await userEvent.click(nested);
		await expect(nested).toHaveAttribute('aria-expanded', 'false');
		await expect(canvas.queryByRole('button', { name: /INDEX\.md/ })).toBeNull();
		await userEvent.click(canvas.getByRole('radio', { name: 'As a list' }));
		await expect(canvas.getByRole('button', { name: /GLOSSARY\.md/ })).toBeVisible();
	}}
>
	<div class="w-60 sheet-quiet">
		<Changes
			git={{
				...pending,
				changes: {
					branch: 'feature',
					comparisonTarget: 'main',
					uncommitted: 0,
					unpushed: null,
					landed: false,
					files: [
						{ path: 'docs/adr/ADR-124-handles.md', status: 'added', added: 7, removed: 0 },
						{
							path: 'docs/adr/very/deeply/nested/directories/INDEX.md',
							status: 'modified',
							added: 2,
							removed: 1
						},
						{ path: 'docs/GLOSSARY.md', status: 'deleted', added: 0, removed: 3 },
						{ path: 'README.md', status: 'modified', added: 1, removed: 1 }
					]
				}
			}}
			onopen={() => {}}
		/>
	</div>
</Story>

<Story name="No changes yet" asChild>
	<div class="flex h-96 w-80 flex-col">
		<Changes
			git={{
				...pending,
				changes: {
					branch: 'feature',
					comparisonTarget: 'main',
					uncommitted: 0,
					unpushed: null,
					landed: false,
					files: []
				}
			}}
			onopen={() => {}}
		/>
	</div>
</Story>
