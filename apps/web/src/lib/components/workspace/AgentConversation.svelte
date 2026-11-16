<script lang="ts">
	import { getWorkspace } from '../../../routes/workspaces.remote';
	import Conversation from './Conversation.svelte';

	/**
	 * The conversation with an agent that works alongside a workspace's own, in its
	 * directory (a reviewer, say): a workspace underneath, shown where it does its work.
	 */
	let { id }: { id: string } = $props();

	const workspace = $derived(await getWorkspace(id));
</script>

<Conversation {workspace} />
