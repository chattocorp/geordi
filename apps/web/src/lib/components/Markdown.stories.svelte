<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, waitFor } from 'storybook/test';
	import Markdown from './Markdown.svelte';
	import WorkspaceLinksExample from './WorkspaceLinksExample.svelte';
	import { tone } from '#lib/ui/tone.ts';

	const { Story } = defineMeta({ title: 'Geordi/Markdown', component: Markdown });

	const fence = (lang: string, code: string) => `\`\`\`${lang}\n${code}\n\`\`\``;

	const diagrams = [
		'The worktree is made before the first turn begins:',
		fence(
			'mermaid',
			[
				'flowchart LR',
				'  A[Person writes] --> B{Worktree ready?}',
				'  B -- yes --> C[Agent works]',
				'  B -- no --> D[Setup script] --> C'
			].join('\n')
		),
		'And the forge asks the daemon for what it needs:',
		fence(
			'mermaid',
			[
				'sequenceDiagram',
				'  Forge->>Daemon: picture?path=chart.svg',
				'  Daemon-->>Forge: image/svg+xml'
			].join('\n')
		),
		'An SVG, drawn as a picture:',
		fence(
			'svg',
			'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80"><rect width="160" height="80" rx="12" fill="#d9a43a"/><circle cx="40" cy="40" r="20" fill="#fff"/></svg>'
		),
		'A diagram with a mistake stays code:',
		fence('mermaid', 'flowchart LR\n  A -->')
	].join('\n\n');
</script>

<Story
	name="Diagrams"
	args={{ text: diagrams }}
	play={async ({ canvasElement }) => {
		await waitFor(() => expect(canvasElement.querySelectorAll('.diagram svg')).toHaveLength(2));
		await waitFor(() => expect(canvasElement.querySelector('img[data-svg]')).not.toBeNull());
		const code = [...canvasElement.querySelectorAll<HTMLElement>('.code-block')];
		expect(code.filter((block) => !block.hidden)).toHaveLength(1);
		expect(canvasElement.querySelector('.diagram image, .diagram a')).toBeNull();
	}}
/>

<!-- the address of the sound, with what is added to it kept in its fragment -->
<Story
	name="Sound"
	args={{
		text: 'Here is the new jump:\n\n![Jump](assets/jump.wav)\n\nShorter, and a little higher.',
		pictures: `data:audio/wav;base64,${tone(520, 1.2)}#`
	}}
	play={async ({ canvas }) => {
		await expect(await canvas.findByRole('button', { name: 'Play Jump' })).toBeVisible();
		await waitFor(() =>
			expect(canvas.getByRole('slider', { name: 'Jump' })).toHaveAttribute(
				'aria-valuetext',
				'0:00.0 of 0:01.2'
			)
		);
	}}
/>

<Story
	name="Sound that cannot be had"
	args={{ text: 'Here is the jump:\n\n![Jump](assets/jump.wav)', pictures: '/nowhere' }}
	play={async ({ canvasElement }) => {
		await waitFor(
			() => expect(canvasElement.querySelector('code')).toHaveTextContent('assets/jump.wav'),
			// a player gives up on what is no sound in its own time
			{ timeout: 5000 }
		);
		await expect(canvasElement.querySelector('[data-sound]')).toBeNull();
	}}
/>

<!-- branches and pull requests of other workspaces lead to them -->
<Story
	name="Workspace links"
	asChild
	play={async ({ canvasElement }) => {
		const links = [...canvasElement.querySelectorAll('a[href="/workspaces/login"]')];
		await expect(links.map((link) => link.textContent)).toEqual([
			'geordi/fix-login-redirect',
			'#451',
			'https://github.com/hmans/geordi/pull/451'
		]);
	}}
>
	<WorkspaceLinksExample
		text="The redirect fix is on `geordi/fix-login-redirect`, in #451 (https://github.com/hmans/geordi/pull/451). `main` and #12 stay as they are."
	/>
</Story>

<Story
	name="Runnable shell block"
	args={{ text: fence('sh', "printf '%s\\n' 'A & B'\npwd"), onrun: fn() }}
	play={async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Run in a new terminal' }));
		await expect(args.onrun).toHaveBeenCalledWith("printf '%s\\n' 'A & B'\npwd\n");
	}}
/>
