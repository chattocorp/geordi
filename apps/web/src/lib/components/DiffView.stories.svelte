<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DiffView from './DiffView.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Diff view', component: DiffView });

	// A file long enough that most of it is collapsed between the two changes.
	const lines = Array.from({ length: 120 }, (_, i) => `export const value${i + 1} = ${i + 1};`);
	const before = ['// Values used across the app.', ...lines].join('\n') + '\n';
	const after =
		[
			'// Values used across the app, in order.',
			...lines.slice(0, 60),
			"export const added = 'new';",
			...lines.slice(60, 110),
			...lines.slice(112)
		].join('\n') + '\n';

	const notes = '# Notes\n\n- one\n- two\n';
	const script = '#!/bin/sh\necho "goodbye"\n';
</script>

<!--
	Unchanged lines between changes are collapsed; the separators expand them 20 at a time,
	up, down or all at once.
-->
<Story name="Modified, with collapsed context" asChild>
	<div class="overflow-hidden card"><DiffView path="src/values.ts" old={before} new={after} /></div>
</Story>

<Story name="New file" asChild>
	<div class="overflow-hidden card">
		<DiffView path="notes.md" old={null} new={notes} />
	</div>
</Story>

<Story name="Deleted file" asChild>
	<div class="overflow-hidden card">
		<DiffView path="old.sh" old={script} new={null} />
	</div>
</Story>
