<script lang="ts">
	/**
	 * A small ring in parts: how many of something stand how, at a glance (checks that
	 * passed, failed, still run). Each part takes its share of the ring, in its colour; an
	 * `empty` part takes its share and leaves it bare (what is left of something). An
	 * `accent` part is something still running: a light goes round it (`ring-running`).
	 */
	type Tone = 'ok' | 'danger' | 'accent' | 'neutral' | 'muted' | 'empty';
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
		neutral: 'stroke-muted/40',
		muted: 'stroke-muted',
		empty: ''
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
	/** Where the light may show: the running arcs, as a mask for it. */
	const running = $derived.by(() => {
		const accent = arcs.filter((arc) => arc.tone === 'accent');
		if (accent.length === 0) return null;
		const circles = accent
			.map(
				(arc) =>
					`<circle cx="8" cy="8" r="${R}" fill="none" stroke="black" stroke-width="2.5" stroke-dasharray="${arc.length} ${AROUND - arc.length}" stroke-dashoffset="${-arc.at}"/>`
			)
			.join('');
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g transform="rotate(-90 8 8)">${circles}</g></svg>`;
		return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
	});
</script>

<span class="relative size-4 shrink-0" role="img" aria-label={label}>
	<svg viewBox="0 0 16 16" class="size-4 -rotate-90" aria-hidden="true">
		<title>{label}</title>
		<circle cx="8" cy="8" r={R} fill="none" stroke-width="2.5" class="stroke-line" />
		{#each arcs.filter((arc) => arc.tone !== 'empty') as arc (arc.at)}
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
	{#if running}
		<!-- the light: an HTML layer, so that it turns on the GPU (`ring-running`) -->
		<span class="absolute inset-0" style:mask-image={running} aria-hidden="true">
			<span class="ring-running"></span>
		</span>
	{/if}
</span>
