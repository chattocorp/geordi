<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';

	const { Story } = defineMeta({ title: 'Foundations' });

	const colours = [
		['bg', 'The page.'],
		['frame', 'What the sheets lie in: the window itself, and its title bar.'],
		['sidebar', 'Sheets beside what is read: the sidebar, changes and terminals.'],
		['surface', 'Cards and anything raised.'],
		['sunken', 'Wells: code, counts, secondary buttons.'],
		['bubble', 'What the user said.'],
		['line', 'Dividers and outlines.'],
		['hover', 'Under what the pointer is on. See-through: shows on any background.'],
		['ink', 'Text.'],
		['muted', 'Secondary text and icons.'],
		['accent', 'The primary action, and things that are live. Nothing else.'],
		['accent-soft', 'Behind accent text.'],
		['accent-ink', 'Accent-coloured text.'],
		['ok', 'Additions, success.'],
		['danger', 'Removals, errors.'],
		['danger-soft', 'Behind danger text.'],
		['claude', 'Claude Code.'],
		['codex', 'Codex.']
	];
</script>

<Story name="Colour" asChild>
	<ul class="grid max-w-4xl gap-3 sm:grid-cols-2">
		{#each colours as [name, use] (name)}
			<li class="flex items-center gap-3">
				<span
					class="size-10 shrink-0 rounded-control ring-1 ring-line"
					style:background="var(--{name})"
				></span>
				<div class="min-w-0">
					<p class="code">{name}</p>
					<p class="text-sm text-muted">{use}</p>
				</div>
			</li>
		{/each}
	</ul>
</Story>

<Story name="Type" asChild>
	<div class="max-w-3xl space-y-6">
		<div>
			<p class="label">text-2xl · title</p>
			<p class="title">Page titles, and nothing else</p>
		</div>
		<div>
			<p class="label">text-base</p>
			<p>Reading and writing: agent replies, prompts, descriptions.</p>
			<p class="heading">A section heading is the same size, heavier.</p>
		</div>
		<div>
			<p class="label">text-sm</p>
			<p class="text-sm">Chrome: navigation, tabs, lists, buttons.</p>
			<p class="code">code: paths/and/branches</p>
		</div>
		<div>
			<p class="label">text-xs</p>
			<p class="text-xs">Captions and counts.</p>
			<p class="code-dense">code-dense: diffs, terminals, tool output</p>
		</div>
	</div>
</Story>

<Story name="Shape and surface" asChild>
	<div class="grid max-w-4xl gap-6 sm:grid-cols-3">
		<div class="card p-5">
			<p class="heading">card</p>
			<p class="text-sm text-muted">Holds content. rounded-card.</p>
		</div>
		<div class="card-float p-5">
			<p class="heading">card-float</p>
			<p class="text-sm text-muted">Lifted: composers, primary things.</p>
		</div>
		<a href="#top" class="block card p-5 card-link">
			<p class="heading">card card-link</p>
			<p class="text-sm text-muted">A card you can click. Hover me.</p>
		</a>
		<div class="empty sm:col-span-2">empty: where something will be.</div>
		<div class="space-y-2">
			<input class="w-full input" placeholder="input" aria-label="Example input" />
			<div class="rounded-control bg-sunken px-3 py-2 text-sm">rounded-control</div>
		</div>
	</div>
</Story>

<Story name="Items and dots" asChild>
	<div class="w-64 space-y-px rounded-card bg-sidebar p-2">
		<p class="px-2.5 pb-1 label">label</p>
		<a href="#top" class="item item-active px-2.5 py-1">
			<span class="dot dot-live"></span> item item-active, working
		</a>
		<a href="#top" class="item px-2.5 py-1"><span class="dot"></span> item, idle</a>
		<a href="#top" class="item px-2.5 py-1"><span class="dot"></span> another item</a>
	</div>
</Story>

<Story name="Running job" asChild>
	<div class="inline-flex items-center gap-1.5 rounded-control bg-sunken px-2.5 py-1 text-sm">
		<span
			class="bar-running icon-[lucide--play] size-3.5 shrink-0 text-accent"
			role="img"
			aria-label="Running"
		></span>
		run
	</div>
</Story>
