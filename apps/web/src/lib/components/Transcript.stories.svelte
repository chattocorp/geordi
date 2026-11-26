<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Markdown from './Markdown.svelte';
	import { expect, fn, userEvent, waitFor } from 'storybook/test';
	import { setChangedFiles } from '#lib/changedFiles.ts';
	import PatchView from './PatchView.svelte';
	import AgentMessage from '@geordi/ui/AgentMessage.svelte';
	import AgentText from '@geordi/ui/AgentText.svelte';
	import UserMessage from '@geordi/ui/UserMessage.svelte';
	import ToolGroup from '@geordi/ui/ToolGroup.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Transcript' });

	// Wait for the lazy parser before timing assertions about the rendered patch.
	async function loadDiffParser() {
		await import('@pierre/diffs');
		return {};
	}

	const openDiff = fn();
	const openSource = fn();
	const openFolder = fn();
	const FOLDERS = new Set(['.', 'assets/audio']);
	const FILES = new Set(['.context/buttons-dark.png', 'README.md']);
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

	/** Tool calls as agents describe them over ACP: a kind, a title, the files they touch. */
	const described = [
		{
			kind: 'tool' as const,
			id: 'a',
			name: 'Read',
			input: '{"file_path":"/work/src/changes.ts","offset":40,"limit":20}',
			toolKind: 'read' as const,
			title: 'Read /work/src/changes.ts (40 - 59)',
			locations: [{ path: '/work/src/changes.ts', line: 40 }],
			output: 'export function changes() {}',
			isError: false,
			at
		},
		{
			kind: 'tool' as const,
			id: 'b',
			name: 'Grep',
			input: '{"pattern":"ignore-submodules","path":"/work/src"}',
			toolKind: 'search' as const,
			title: 'grep "ignore-submodules" /work/src',
			locations: [{ path: '/work/src' }],
			output: 'src/git.ts',
			isError: false,
			at
		},
		{
			kind: 'tool' as const,
			id: 'c',
			name: 'Edit',
			input: '{"file_path":"/work/src/git.ts","old_string":"a","new_string":"b"}',
			toolKind: 'edit' as const,
			title: 'Edit /work/src/git.ts',
			locations: [{ path: '/work/src/git.ts', line: 12 }],
			output: '',
			isError: false,
			at
		},
		{
			kind: 'tool' as const,
			id: 'd',
			name: 'exec_command',
			input: '{"command":"pnpm test","cwd":"/work"}',
			toolKind: 'execute' as const,
			title: 'pnpm test',
			output: '1 failed',
			isError: true,
			at
		},
		{
			kind: 'tool' as const,
			id: 'e',
			name: 'exec_command',
			input: '{"command":"ls -la","cwd":"/work"}',
			toolKind: 'read' as const,
			title: 'List files',
			output: null,
			isError: false,
			at
		}
	];

	const notes = '/work/notes.md';
	const edits = [
		{
			kind: 'tool' as const,
			id: 'e1',
			name: 'Edit',
			input: JSON.stringify({ file_path: notes, old_string: 'one', new_string: 'two' }),
			output: '[{"type":"diff"}]',
			isError: false,
			at,
			diff: {
				files: [{ operation: 'modify', path: notes, fileType: 'text' }],
				patch: [
					`diff --git ${notes} ${notes}`,
					`--- ${notes}`,
					`+++ ${notes}`,
					'@@ -1,4 +1,4 @@',
					' # Notes',
					' ',
					'-- one',
					'+- two',
					' - three',
					''
				].join('\n')
			}
		},
		{
			kind: 'tool' as const,
			id: 'e2',
			name: 'Editing files',
			input: '',
			output: '',
			isError: false,
			at,
			diff: {
				files: [
					{ operation: 'add', path: '/work/src/greet.ts', fileType: 'text' },
					{ operation: 'move', oldPath: '/work/old.txt', path: '/work/new.txt' },
					{ operation: 'add', path: '/work/logo.png', fileType: 'binary' }
				],
				patch: [
					'diff --git /work/src/greet.ts /work/src/greet.ts',
					'new file mode 100644',
					'--- /dev/null',
					'+++ /work/src/greet.ts',
					'@@ -0,0 +1,3 @@',
					'+export function greet(name: string) {',
					'+\treturn `Hello, ${name}!`;',
					'+}',
					''
				].join('\n')
			}
		},
		{
			kind: 'tool' as const,
			id: 'e3',
			name: 'Write',
			input: JSON.stringify({ file_path: '/work/data.json' }),
			output: '',
			isError: false,
			at,
			diff: {
				files: [{ operation: 'add', path: '/work/data.json', fileType: 'text' }],
				tooLarge: true
			}
		}
	];
</script>

<script lang="ts">
	const workspace = setChangedFiles({
		root: '/work',
		paths: new Set(['src/git.ts']),
		open: openDiff,
		openSource,
		kindOf: async (path) => (FOLDERS.has(path) ? 'folder' : FILES.has(path) ? 'file' : null),
		openFolder
	});
</script>

<Story
	name="Relative file link"
	asChild
	play={async ({ canvas }) => {
		openDiff.mockClear();
		const file = canvas.getByRole('button', { name: 'changes.ts' });
		await expect(file).toHaveAttribute('title', 'View the diff');
		await userEvent.click(file);
		await expect(openDiff).toHaveBeenCalledWith('src/changes.ts');
	}}
>
	<Markdown
		text="Review the changes in [`changes.ts`](./src/changes.ts &quot;View the diff&quot;)."
	/>
</Story>

<Story
	name="Folder link"
	asChild
	play={async ({ canvas }) => {
		openFolder.mockClear();
		const folder = await canvas.findByRole('button', { name: 'assets/audio/' });
		await expect(folder).toHaveAttribute('title', 'Open this folder');
		await userEvent.click(folder);
		await expect(openFolder).toHaveBeenCalledWith('assets/audio');
		await expect(canvas.getByRole('button', { name: 'the worktree' })).toBeInTheDocument();
		await expect(canvas.queryByRole('button', { name: 'mistake/' })).toBeNull();
	}}
>
	<Markdown
		text="The new takes are under `assets/audio/`, in `mistake/` and `orders/`. Everything else is in [the worktree](/work/)."
	/>
</Story>

<Story
	name="File in the worktree"
	asChild
	play={async ({ canvas }) => {
		openSource.mockClear();
		const file = await canvas.findByRole('button', { name: '.context/buttons-dark.png' });
		await expect(file).toHaveAttribute('title', 'Open this file');
		await userEvent.click(file);
		await expect(openSource).toHaveBeenCalledWith('.context/buttons-dark.png', undefined);
		await userEvent.click(await canvas.findByRole('button', { name: 'README.md:12' }));
		await expect(openSource).toHaveBeenCalledWith('README.md', 12);
		await expect(canvas.queryByRole('button', { name: 'missing.ts' })).toBeNull();
	}}
>
	<Markdown
		text="The dark-mode version is at `.context/buttons-dark.png`. See `README.md:12`, not `missing.ts`."
	/>
</Story>

<Story name="User message" asChild>
	<div class="max-w-2xl sheet p-4">
		<UserMessage text="BTW why would we do the third one after the release?" />
	</div>
</Story>

<Story name="Agent reply" asChild>
	<div class="max-w-2xl space-y-6">
		<UserMessage text="What changed?" />
		<AgentMessage agent="claude">
			<AgentText text={reply}><Markdown text={reply} /></AgentText>
		</AgentMessage>
	</div>
</Story>

<Story name="Inline code" asChild>
	<div class="max-w-2xl">
		<Markdown
			text="The `start_agent` tool returns the workspace ID. The route lives in `apps/web/src/routes/workspaces/[id]/+page.svelte`. Open the [example workspace](/workspaces/example) at [`/workspaces/example`](/workspaces/example)."
		/>
	</div>
</Story>

<Story name="Earlier messages are dimmed" asChild>
	<div class="max-w-2xl space-y-6">
		<Markdown text="I’ll check the **changes pane** and its `git diff` command." dimmed />
		<ToolGroup {workspace} {PatchView} tools={tools.slice(0, 2)} cwd="/work" />
		<Markdown text="The command includes submodules. I’ll update it and run the checks." dimmed />
		<Markdown text={reply} />
	</div>
</Story>

<!-- As recorded before Geordi kept what agents say of a tool call: its name and input. -->
<Story name="Tool calls" asChild>
	<div class="max-w-2xl space-y-6">
		<!-- over: what was used; a click shows the calls -->
		<ToolGroup {workspace} {PatchView} {tools} cwd="/work" />
		<!-- under way: the tool that is running -->
		<ToolGroup {workspace} {PatchView} {tools} cwd="/work" live />
		<!-- over, but a tool still runs in the background -->
		<ToolGroup {workspace} {PatchView} {tools} cwd="/work" backgroundIds={[tools[0].id]} />
	</div>
</Story>

<!--
	As agents describe them: an icon for the kind, the title with its paths in mono. Open one
	to see the files it names (a changed file leads to its changes), its input and output.
-->
<Story
	name="Described tool calls"
	asChild
	play={async ({ canvas }) => {
		openSource.mockClear();
		openDiff.mockClear();
		const [group] = canvas.getAllByText('Tools');
		await userEvent.click(group);
		await userEvent.click(canvas.getAllByText('(40 - 59)')[0]);
		await userEvent.click(canvas.getAllByRole('button', { name: 'src/changes.ts:40' })[0]);
		await expect(openSource).toHaveBeenCalledWith('src/changes.ts', 40);
		await userEvent.click(canvas.getAllByText('src/git.ts')[0]);
		await userEvent.click(canvas.getAllByRole('button', { name: 'src/git.ts:12' })[0]);
		await expect(openDiff).toHaveBeenCalledWith('src/git.ts');
	}}
>
	<div class="max-w-2xl space-y-6">
		<ToolGroup {workspace} {PatchView} tools={described} cwd="/work" />
		<ToolGroup {workspace} {PatchView} tools={described} cwd="/work" live />
	</div>
</Story>

<!--
	Edits show what they changed, from the patch the agent sent: one file's diff after
	another, or in words what can't be drawn (a move, a picture, a patch too large to keep).
-->
<Story
	name="Edits"
	loaders={[loadDiffParser]}
	asChild
	play={async ({ canvas, canvasElement }) => {
		await userEvent.click(canvas.getByText('Tools'));
		for (const call of canvasElement.querySelectorAll('details details > summary'))
			await userEvent.click(call);
		await expect(await canvas.findByText('Moved old.txt to new.txt')).toBeVisible();
		await expect(canvas.getByText('Added logo.png (not a text file)')).toBeVisible();
		await expect(canvas.getByText('This change is too large to show here.')).toBeVisible();
		await expect(canvas.getByText('src/greet.ts')).toBeVisible();
		// both patches drawn by the viewer
		await waitFor(() =>
			expect(canvasElement.querySelectorAll('.diff-view:not(:empty)')).toHaveLength(2)
		);
	}}
>
	<div class="max-w-2xl"><ToolGroup {workspace} {PatchView} tools={edits} cwd="/work" /></div>
</Story>

<Story
	name="Turn review files"
	loaders={[loadDiffParser]}
	asChild
	play={async ({ canvasElement }) => {
		await waitFor(() => expect(canvasElement.querySelectorAll('details[open]')).toHaveLength(2));
		const [first, second] = canvasElement.querySelectorAll('details');
		await userEvent.click(first.querySelector('summary')!);
		await expect(first.open).toBe(false);
		await expect(second.open).toBe(true);
	}}
>
	<PatchView
		collapsible
		cwd="/work"
		diff={{
			files: [...edits[0].diff.files, ...edits[1].diff.files],
			patch: edits[0].diff.patch! + edits[1].diff.patch!
		}}
	/>
</Story>

<Story
	name="Expand turn context"
	loaders={[loadDiffParser]}
	asChild
	play={async ({ canvasElement }) => {
		const root = () => canvasElement.querySelector('diffs-container')?.shadowRoot;
		const expand = await waitFor(() => {
			const button = root()?.querySelector<HTMLElement>('[data-expand-button]');
			expect(button).toBeTruthy();
			return button!;
		});
		expect(root()?.querySelector('code')?.textContent).not.toContain('section12');
		await userEvent.click(expand);
		await waitFor(() => expect(root()?.querySelector('code')?.textContent).toContain('section12'));
	}}
>
	<PatchView
		collapsible
		diff={{
			fullContext: true,
			files: [{ operation: 'modify', path: 'sections.ts' }],
			patch:
				'diff --git a/sections.ts b/sections.ts\n--- a/sections.ts\n+++ b/sections.ts\n@@ -1,25 +1,25 @@\n' +
				Array.from({ length: 24 }, (_, i) => ` export const section${i + 1} = ${i + 1};\n`).join(
					''
				) +
				'-export const sections = 24;\n+export const sections = 25;\n'
		}}
	/>
</Story>

<Story
	name="Review finding"
	asChild
	play={async ({ canvas }) => {
		openSource.mockClear();
		await userEvent.click(canvas.getByRole('button', { name: 'src/changes.ts:40–42' }));
		await expect(openSource).toHaveBeenCalledWith('src/changes.ts', 40);
	}}
>
	<div class="max-w-2xl sheet p-4">
		<Markdown
			agentDirectives
			text={'I found one issue in the changes pane.\n\n::code-comment{title="Refresh the diff after a rename" body="The selection still points to the old path, so the diff stays empty until you select the file again." file="/work/src/changes.ts" start=40 end=42 priority=2}'}
		/>
	</div>
</Story>
