<script lang="ts">
	import { onMount } from 'svelte';
	import Button from './Button.svelte';

	let dark = $state(false);

	// The theme is applied in app.html before first paint; pick it up once mounted.
	onMount(() => {
		dark = document.documentElement.classList.contains('dark');
	});

	function toggle() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		try {
			localStorage.setItem('theme', dark ? 'dark' : 'light');
		} catch {
			// Storage unavailable (private mode); the choice lasts for this page only.
		}
	}
</script>

<Button
	variant="ghost"
	icon={dark ? 'icon-[lucide--sun]' : 'icon-[lucide--moon]'}
	label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
	onclick={toggle}
/>
