<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import Markdown from './Markdown.svelte';

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

<Story
	name="Sound that cannot be had"
	args={{ text: 'Here is the jump:\n\n![Jump](assets/jump.wav)', pictures: '/nowhere' }}
	play={async ({ canvasElement }) => {
		await waitFor(
			() => expect(canvasElement.querySelector('code')).toHaveTextContent('assets/jump.wav'),
			// a player gives up on what is no sound in its own time
			{ timeout: 5000 }
		);
		await expect(canvasElement.querySelector('audio')).toBeNull();
	}}
/>
