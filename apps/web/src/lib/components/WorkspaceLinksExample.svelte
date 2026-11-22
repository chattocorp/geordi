<script lang="ts">
	// For stories: Markdown as a conversation shows it, with workspaces to link to
	import Markdown from './Markdown.svelte';
	import { setWorkspaceLinks, workspaceLinks } from '#lib/workspace-links.ts';

	let { text }: { text: string } = $props();

	const links = workspaceLinks(
		[
			{ id: 'here', repoId: 'geordi', branch: 'geordi/here', pull: null },
			{
				id: 'login',
				repoId: 'geordi',
				branch: 'geordi/fix-login-redirect',
				pull: { number: '451', url: 'https://github.com/hmans/geordi/pull/451' }
			}
		],
		'here'
	);
	setWorkspaceLinks(() => links);
</script>

<Markdown {text} />
