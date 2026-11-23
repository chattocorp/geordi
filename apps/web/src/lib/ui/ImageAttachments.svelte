<script lang="ts">
	let {
		images,
		onremove
	}: {
		images: { id: string; src: string; alt: string }[];
		onremove: (id: string) => void;
	} = $props();
</script>

{#if images.length}
	<ul aria-label="Attached images" class="flex gap-3 overflow-x-auto px-4 py-3">
		{#each images as image, index (image.id)}
			<li
				class="group/attachment relative min-w-10 shrink-0 rounded-control bg-sunken ring-1 ring-line"
			>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- callers supply resolved image URLs -->
				<a
					href={image.src}
					target="_blank"
					rel="noreferrer"
					aria-label={`Open image ${index + 1}`}
					class="block rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				>
					<img
						src={image.src}
						alt={image.alt}
						class="mx-auto h-20 w-auto max-w-64 rounded-control object-contain"
					/>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				<button
					type="button"
					aria-label={`Remove image ${index + 1}`}
					title={`Remove image ${index + 1}`}
					onclick={() => onremove(image.id)}
					class="absolute top-1 right-1 grid size-5 place-items-center rounded-full raised text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 pointer-fine:opacity-0 pointer-fine:group-focus-within/attachment:opacity-100 pointer-fine:group-hover/attachment:opacity-100"
				>
					<span class="icon-[lucide--x] size-3"></span>
				</button>
			</li>
		{/each}
	</ul>
{/if}
