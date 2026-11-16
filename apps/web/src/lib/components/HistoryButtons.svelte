<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import Button from '#lib/ui/Button.svelte';

	// Where the browser says whether there is anywhere to go (Chromium does), the buttons know.
	type Navigation = { canGoBack: boolean; canGoForward: boolean };
	const navigation = () => (globalThis as { navigation?: Navigation }).navigation;

	let can = $state({ back: true, forward: true });
	afterNavigate(() => {
		const { canGoBack: back = true, canGoForward: forward = true } = navigation() ?? {};
		can = { back, forward };
	});
</script>

<!-- Back and forward, for where there is no browser around the page to offer them. -->
<Button
	variant="ghost"
	icon="icon-[lucide--arrow-left]"
	label="Back"
	disabled={!can.back}
	onclick={() => history.back()}
/>
<Button
	variant="ghost"
	icon="icon-[lucide--arrow-right]"
	label="Forward"
	disabled={!can.forward}
	onclick={() => history.forward()}
/>
