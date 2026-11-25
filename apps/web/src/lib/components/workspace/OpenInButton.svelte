<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import ButtonGroup from '@geordi/ui/ButtonGroup.svelte';
	import { openMenu } from '#lib/ui/menu.svelte.ts';
	import type { OpenInApp } from '#lib/open-in.ts';
	let {
		apps,
		onlaunch,
		onconfigure
	}: { apps: OpenInApp[]; onlaunch: (app: OpenInApp) => void; onconfigure: () => void } = $props();
	const enabled = $derived(apps.filter((app) => app.enabled));
	function menu(event: MouseEvent) {
		openMenu(event.currentTarget as Element, [
			...enabled.map((app) => ({ label: app.name, onselect: () => onlaunch(app) })),
			'separator',
			{ label: 'Configure…', onselect: onconfigure }
		]);
	}
</script>

{#if enabled[0]}
	<ButtonGroup label="Open in…">
		<Button
			size="sm"
			icon="icon-[lucide--external-link]"
			label={'Open in ' + enabled[0].name}
			onclick={() => onlaunch(enabled[0])}
		>
			<span class="sr-only max-w-28 truncate @xs/changes:not-sr-only">
				Open in {enabled[0].name}
			</span>
		</Button>
		<Button
			size="sm"
			icon="icon-[lucide--chevron-down]"
			label="Choose an app"
			aria-haspopup="menu"
			onclick={menu}
		/>
	</ButtonGroup>
{/if}
