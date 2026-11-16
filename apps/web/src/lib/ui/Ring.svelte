<script lang="ts">
	/**
	 * A small ring in parts: how many of something stand how, at a glance (checks that
	 * passed, failed, still run). Each part takes its share of the ring, in its colour.
	 */
	type Tone = 'ok' | 'danger' | 'accent' | 'neutral';
	type Props = {
		parts: { size: number; tone: Tone }[];
		/** What it shows, in words. */
		label: string;
	};
	let { parts, label }: Props = $props();

	const R = 6;
	const AROUND = 2 * Math.PI * R;
	const strokes: Record<Tone, string> = {
		ok: 'stroke-ok',
		danger: 'stroke-danger',
		accent: 'stroke-accent',
		neutral: 'stroke-muted/40'
	};
	const arcs = $derived.by(() => {
		const total = parts.reduce((sum, part) => sum + part.size, 0);
		let at = 0;
		return parts
			.filter((part) => part.size > 0)
			.map((part) => {
				const length = (part.size / total) * AROUND;
				const arc = { tone: part.tone, length, at };
				at += length;
				return arc;
			});
	});
</script>

<svg viewBox="0 0 16 16" class="size-4 shrink-0 -rotate-90" role="img" aria-label={label}>
	<title>{label}</title>
	<circle cx="8" cy="8" r={R} fill="none" stroke-width="2.5" class="stroke-line" />
	{#each arcs as arc (arc.at)}
		<circle
			cx="8"
			cy="8"
			r={R}
			fill="none"
			stroke-width="2.5"
			class={strokes[arc.tone]}
			stroke-dasharray="{arc.length} {AROUND - arc.length}"
			stroke-dashoffset={-arc.at}
		/>
	{/each}
</svg>
