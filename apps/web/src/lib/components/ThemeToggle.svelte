<script lang="ts">
	import { onMount } from 'svelte';

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

<button
	type="button"
	onclick={toggle}
	class="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"
	aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
	title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
>
	<span class={['size-4', dark ? 'icon-[lucide--sun]' : 'icon-[lucide--moon]']}></span>
</button>
