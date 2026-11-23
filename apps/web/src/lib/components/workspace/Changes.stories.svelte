<script module lang="ts">
	import { expect, fn, waitFor } from 'storybook/test';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Panes from '#lib/ui/Panes.svelte';
	import DiffView from '@geordi/ui/DiffView.svelte';
	import { open, singleGroup, type Layout } from '#lib/layout.ts';
	import Changes from '@geordi/ui/Changes.svelte';
	import Select from '#lib/ui/Select.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Changes', component: Changes });
	/** The branch chosen in the story, until then the one it is compared with. */
	let base = $state<string>();
	const branches = ['main', 'release/2', 'geordi/fix-login'].map((value) => ({
		value,
		label: value
	}));
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
	// a branch that moves a whole directory of recordings: far more rows than fit
	const many = Array.from({ length: 2000 }, (_, i) => ({
		path: `assets/audio/voices/${String(i).padStart(4, '0')}_nora.ogg`,
		from: `assets/sounds/voices/${String(i).padStart(4, '0')}_nora.ogg`,
		status: 'renamed' as const,
		added: 0,
		removed: 0
	}));
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
	let few = $state(false);
	let unloaded = $state(false);
	let layout = $state.raw<Layout>(singleGroup(['Conversation']));
</script>

<Story
	name="Switch files in one diff tab"
	asChild
	play={async ({ canvas, userEvent }) => {
		for (const name of ['index.ts', 'format.ts']) {
			await userEvent.click(await canvas.findByRole('button', { name: new RegExp(name) }));
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
		onopen: fn(),
		onopencombined: fn()
	}}
	play={async ({ canvas, userEvent, args }) => {
		await expect(canvas.getByText('main')).toBeVisible();
		await userEvent.click(await canvas.findByRole('button', { name: /message.txt/ }));
		await expect(args.onopen).toHaveBeenCalledWith('message.txt');
		await userEvent.click(canvas.getByRole('button', { name: 'Open combined diff' }));
		await expect(args.onopencombined).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Thousands of files"
	asChild
	play={async ({ canvas, userEvent }) => {
		await expect(await canvas.findByRole('button', { name: /0000_nora\.ogg/ })).toBeVisible();
		// only the first rows are drawn, in the list and in the tree
		await expect(canvas.getAllByRole('listitem').length).toBeLessThanOrEqual(200);
		await userEvent.click(canvas.getByRole('radio', { name: 'As a tree' }));
		await expect(canvas.getAllByRole('listitem').length).toBeLessThanOrEqual(200);
	}}
>
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
					files: many
				}
			}}
			onopen={() => {}}
		/>
	</div>
</Story>

<Story
	name="A base to choose"
	asChild
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Compared with: main' }));
		await userEvent.click(await canvas.findByRole('option', { name: 'release/2' }));
		await expect(canvas.getByRole('button', { name: 'Compared with: release/2' })).toBeVisible();
	}}
>
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
					files: many.slice(0, 3)
				}
			}}
			onopen={() => {}}
		>
			{#snippet target(name)}
				<Select
					label="Compared with"
					options={branches}
					bind:value={() => base ?? name, (next) => (base = next)}
				>
					{#snippet trigger()}
						<span class="icon-[lucide--git-compare] size-3.5 shrink-0"></span>
						<span class="truncate text-ink">{base ?? name}</span>
					{/snippet}
				</Select>
			{/snippet}
		</Changes>
	</div>
</Story>

<Story
	name="Another workspace with fewer files"
	asChild
	play={async ({ canvas, userEvent }) => {
		await canvas.findByRole('button', { name: /0000_nora\.ogg/ });
		// in the tree, where a switch once broke the list
		await userEvent.click(canvas.getByRole('radio', { name: 'As a tree' }));
		await userEvent.click(canvas.getByRole('button', { name: 'Unload' }));
		await userEvent.click(canvas.getByRole('button', { name: 'Switch' }));
		await expect(await canvas.findByRole('button', { name: /message\.txt/ })).toBeVisible();
		await expect(canvas.queryByRole('button', { name: /0000_nora\.ogg/ })).toBeNull();
	}}
>
	<button type="button" onclick={() => ((few = !few), (unloaded = false))}>Switch</button>
	<button type="button" onclick={() => (unloaded = true)}>Unload</button>
	<div class="flex h-96 w-80 flex-col">
		<Changes
			git={unloaded
				? null
				: {
						...pending,
						changes: {
							branch: 'feature',
							comparisonTarget: 'main',
							uncommitted: 0,
							unpushed: null,
							landed: false,
							files: few
								? [
										{ path: 'message.txt', status: 'modified', added: 1, removed: 1 },
										{ path: 'other.txt', status: 'added', added: 1, removed: 0 }
									]
								: many
						}
					}}
			onopen={() => {}}
		/>
	</div>
</Story>

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
		const nested = await canvas.findByRole('button', { name: 'very/deeply/nested/directories' });
		await expect(nested).toHaveAttribute('aria-expanded', 'true');
		await expect(canvas.getByText('directories')).toHaveStyle({
			color: getComputedStyle(nested).color
		});
		await waitFor(() => expect(nested).toHaveTextContent(/^v\/.*directories$/));
		await expect(nested).toHaveStyle({ fontSize: '15px' });
		await expect(await canvas.findByRole('button', { name: /INDEX\.md/ })).toBeVisible();
		await userEvent.click(nested);
		await expect(nested).toHaveAttribute('aria-expanded', 'false');
		await expect(canvas.queryByRole('button', { name: /INDEX\.md/ })).toBeNull();
		await userEvent.click(canvas.getByRole('radio', { name: 'As a list' }));
		await expect(await canvas.findByRole('button', { name: /GLOSSARY\.md/ })).toBeVisible();
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
