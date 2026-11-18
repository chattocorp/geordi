<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Markdown from './Markdown.svelte';
	import ToolGroup from './ToolGroup.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Transcript' });

	const reply = [
		'## What I changed',
		'',
		'The **changes pane** now ignores submodules. Two things to know:',
		'',
		'- `git diff` no longer looks inside nested repositories.',
		'- A [regression test](https://example.com) covers it.',
		'',
		'```ts',
		"const SAFE = ['--no-ext-diff', '--no-textconv', '--ignore-submodules=all'];",
		'```',
		'',
		'> Images in agent output become plain links: ![chart](https://example.com/chart.png)'
	].join('\n');

	const at = '2026-11-14T12:00:00Z';
	const tools = [
		{
			kind: 'tool' as const,
			id: '1',
			name: 'shell',
			input: 'git status',
			output: 'nothing to commit',
			isError: false,
			at
		},
		{
			kind: 'tool' as const,
			id: '2',
			name: 'Read',
			input: '{"file_path":"/work/src/changes.ts"}',
			output: 'export function changes() {}',
			isError: false,
			at
		},
		{
			kind: 'tool' as const,
			id: '3',
			name: 'shell',
			input: 'pnpm test',
			output: '1 failed',
			isError: true,
			at
		},
		{
			kind: 'tool' as const,
			id: '4',
			name: 'shell',
			input: 'pnpm build',
			output: null,
			isError: false,
			at
		}
	];
</script>

<Story name="Agent reply" asChild>
	<div class="max-w-2xl"><Markdown text={reply} /></div>
</Story>

<Story name="Inline code" asChild>
	<div class="max-w-2xl">
		<Markdown
			text="The `start_agent` tool returns the workspace ID. The route lives in `apps/web/src/routes/workspaces/[id]/+page.svelte`. For example, [`/workspaces/example`](/workspaces/example) opens that conversation."
		/>
	</div>
</Story>

<Story name="Earlier messages are dimmed" asChild>
	<div class="max-w-2xl space-y-6">
		<Markdown text="I’ll check the **changes pane** and its `git diff` command." dimmed />
		<ToolGroup tools={tools.slice(0, 2)} cwd="/work" />
		<Markdown text="The command includes submodules. I’ll update it and run the checks." dimmed />
		<Markdown text={reply} />
	</div>
</Story>

<!-- Finished, failed and still-running tool calls. Open one to see its input and output. -->
<Story name="Tool calls" asChild>
	<div class="max-w-2xl space-y-6">
		<!-- over: what was used; a click shows the calls -->
		<ToolGroup {tools} cwd="/work" />
		<!-- under way: the tool that is running -->
		<ToolGroup {tools} cwd="/work" live />
	</div>
</Story>
