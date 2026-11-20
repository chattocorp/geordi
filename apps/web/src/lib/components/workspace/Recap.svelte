<script lang="ts">
	let { text }: { text: string } = $props();
</script>

<aside aria-label="Workspace recap" class="mx-auto w-full max-w-5xl px-5 pt-3">
	<div class="rounded-control bg-sunken px-3 py-2 text-sm">
		<h3 class="font-semibold text-ink">Since you last looked</h3>
		<p class="max-h-32 overflow-auto whitespace-pre-line text-prose">{text}</p>
	</div>
</aside>
