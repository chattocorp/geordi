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
		['prose', 'Long text: a little softer than ink.'],
		['muted', 'Secondary text and icons.'],
		['faint', 'What need not be read: placeholders, rows put aside. See-through.'],
		['accent', 'The primary action, and things that are live. Nothing else.'],
		['accent-ink', 'Accent-coloured text.'],
		['ok', 'Additions, success.'],
		['danger', 'Removals, errors.'],
		['warning', 'Getting low, before it is danger.'],
		['merged', 'Done and landed.'],
		['claude', 'Claude Code.'],
		['codex', 'Codex.']
	];
	// the relative colours are not variables of their own: they are only utilities
	const relative: Record<string, string> = { hover: 'bg-hover', faint: 'bg-faint' };
</script>

<Story name="Colour" asChild>
	<ul class="grid max-w-4xl gap-3 sm:grid-cols-2">
		{#each colours as [name, use] (name)}
			<li class="flex items-center gap-3">
				<span
					class={['size-10 shrink-0 rounded-control ring-1 ring-line', relative[name]]}
					style:background={relative[name] ? undefined : `var(--${name})`}
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
		<div class="flex items-center gap-3 p-5">
			<span class="grid size-7 place-items-center rounded-control raised text-muted">
				<span class="icon-[lucide--copy] size-3.5"></span>
			</span>
			<p class="text-sm text-muted">raised: what cards, inputs and small controls share.</p>
		</div>
		<div class="empty sm:col-span-2">empty: where something will be.</div>
		<div class="space-y-2">
			<input class="w-full input" placeholder="input" aria-label="Example input" />
			<div class="rounded-control bg-sunken px-3 py-2 text-sm">rounded-control</div>
		</div>
	</div>
</Story>

<Story name="Tones" asChild>
	<div class="max-w-3xl space-y-4">
		<p class="text-sm text-muted">
			A colour that says something, as a soft tint with text in it. See-through: the same on a
			sheet, a quiet sheet and a card.
		</p>
		{#each ['sheet', 'sheet-quiet', 'card'] as surface (surface)}
			<div class={[surface, 'flex flex-wrap items-center gap-2 p-4']}>
				<span class="w-24 code-dense text-muted">{surface}</span>
				<span class="rounded-full tone-ok px-3 py-1 text-xs font-medium">tone-ok</span>
				<span class="rounded-full tone-danger px-3 py-1 text-xs font-medium">tone-danger</span>
				<span class="rounded-full tone-merged px-3 py-1 text-xs font-medium">tone-merged</span>
				<span class="rounded-full tone-accent px-3 py-1 text-xs font-medium">tone-accent</span>
				<button
					type="button"
					class="rounded-full tone-ok px-3 py-1 text-xs font-medium hover:bg-current/20"
				>
					pressable
				</button>
			</div>
		{/each}
	</div>
</Story>

<Story name="Items and dots" asChild>
	<div class="flex flex-wrap items-start gap-6">
		<div class="w-64 space-y-px sheet-quiet p-2">
			<p class="px-2.5 pb-1 label">label</p>
			<a href="#top" class="item item-active px-2.5 py-1">
				<span class="dot bg-accent"></span> item item-active, working
			</a>
			<a href="#top" class="item px-2.5 py-1"><span class="dot"></span> item, idle</a>
			<a href="#top" class="item bg-hover px-2.5 py-1 text-ink">
				<span class="dot"></span> item, pointed at
			</a>
			<a href="#top" class="item px-2.5 py-1 text-faint"><span class="dot"></span> put aside</a>
		</div>
		<div class="w-64 card-float p-2">
			<button type="button" class="menu-item">menu-item</button>
			<button type="button" class="menu-item item-picked">menu-item item-picked</button>
			<button type="button" class="menu-item">another one</button>
		</div>
		<div class="sheet p-2">
			<div class="flex gap-1">
				<span class="item h-7 tab-active px-2">tab-active</span>
				<span class="item h-7 px-2 tab-inactive">tab-inactive</span>
			</div>
		</div>
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
