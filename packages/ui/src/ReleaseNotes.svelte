<script lang="ts">
	import Disclosure from './Disclosure.svelte';
	import { HIGHLIGHTS, parseChangelog, SMALLER_CHANGES, type Note } from './changelog.ts';

	/** `changelog` is the text of `CHANGELOG.md`, as Sweet Release writes it. */
	let { changelog }: { changelog: string } = $props();

	const releases = $derived(
		parseChangelog(changelog).filter(({ sections }) => sections.some(({ notes }) => notes.length))
	);
</script>

{#snippet text(note: Note)}
	{#each note as span, at (at)}
		{#if span.code}<code class="code">{span.text}</code>
		{:else if span.href}<a
				href={span.href}
				target="_blank"
				rel="noreferrer"
				class="text-muted file-link"
			>
				{span.text}
			</a>
		{:else}{span.text}{/if}
	{/each}
{/snippet}

{#snippet list(notes: Note[])}
	<ul class="list-disc space-y-1.5 pl-5 text-pretty marker:text-muted">
		{#each notes as note, index (index)}
			<li>{@render text(note)}</li>
		{/each}
	</ul>
{/snippet}

<!--
	What changed in each release, the latest first, as the changelog has it: its highlights
	first and marked, its smaller changes folded away.
-->
<div class="space-y-10">
	{#each releases as release (release.version)}
		<section aria-labelledby="release-{release.version}" class="space-y-4">
			<h2 id="release-{release.version}" class="heading">{release.version}</h2>
			{#each release.sections as section (section.title)}
				{#if section.title === HIGHLIGHTS}
					<div class="space-y-3 card p-4">
						<h3 class="label">{section.title}</h3>
						<ul class="space-y-2.5 text-pretty">
							{#each section.notes as note, index (index)}
								<li class="flex gap-2.5 font-medium">
									<span
										aria-hidden="true"
										class="mt-1 icon-[lucide--sparkles] size-4 shrink-0 text-accent"
									></span>
									<span>{@render text(note)}</span>
								</li>
							{/each}
						</ul>
					</div>
				{:else if section.title === SMALLER_CHANGES}
					<Disclosure summaryClass="w-fit cursor-pointer">
						{#snippet heading()}
							<h3 class="label">{section.title} ({section.notes.length})</h3>
						{/snippet}
						<div class="pt-2">{@render list(section.notes)}</div>
					</Disclosure>
				{:else}
					<div class="space-y-2">
						<h3 class="label">{section.title}</h3>
						{@render list(section.notes)}
					</div>
				{/if}
			{/each}
		</section>
	{/each}
</div>
