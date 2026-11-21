<script module lang="ts">
	/** The one sound that plays: starting another pauses it. */
	let playing: HTMLAudioElement | undefined;

	/** How finely the loudness is measured; the bars shown are as many as fit. */
	const STEPS = 512;

	/**
	 * How loud the sound is along its length, in `STEPS` steps from 0 to 1. Decoded without an
	 * output device (`OfflineAudioContext`): opening one could have macOS ask for the microphone.
	 */
	async function waveform(bytes: ArrayBuffer): Promise<number[]> {
		const sound = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
		const samples = sound.getChannelData(0);
		const step = Math.max(1, Math.floor(samples.length / STEPS));
		const peaks = Array.from({ length: STEPS }, (_, bar) => {
			let peak = 0;
			for (let index = bar * step; index < Math.min((bar + 1) * step, samples.length); index++)
				peak = Math.max(peak, Math.abs(samples[index]));
			return peak;
		});
		const loudest = Math.max(...peaks) || 1;
		return peaks.map((peak) => peak / loudest);
	}

	/** `m:ss`, with tenths of a second where the whole is short enough to need them. */
	function time(seconds: number, length: number) {
		// counted in tenths, so that 1.2 (stored as 1.1999…) stays 1.2
		const tenths = Math.floor(seconds * 10 + 1e-6);
		const whole = Math.floor(tenths / 10);
		const shown = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
		return length < 10 ? `${shown}.${tenths % 10}` : shown;
	}
</script>

<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import type { Attachment } from 'svelte/attachments';

	type Props = {
		src: string;
		/** Names the sound for assistive technology. */
		label: string;
		/** Shown beside the sound (`Before`, `After`). */
		caption?: string;
		/** How long the sound is, once known. */
		duration?: number;
		/**
		 * How many seconds the full width stands for, so that sounds shown together are drawn
		 * on one scale. Without it, the sound fills the width.
		 */
		span?: number;
		/** Called instead of saying so when the sound cannot be played. */
		onfail?: () => void;
	};
	let { src, label, caption, duration = $bindable(0), span, onfail }: Props = $props();

	let audio = $state<HTMLAudioElement>();
	let paused = $state(true);
	let currentTime = $state(0);
	let failed = $state(false);
	let peaks = $state<number[]>();

	/** Whether the player is on screen, or nearly: only then is its sound fetched. */
	let near = $state(false);
	/** The sound, once fetched: the player plays what the waveform was drawn from. */
	let loaded = $state<string>();

	const nearby: Attachment<HTMLElement> = (node) => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				near = true;
				observer.disconnect();
			},
			{ rootMargin: '400px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	};

	// fetched once, for the waveform and the player both
	$effect(() => {
		if (!near) return;
		const from = src;
		const stop = new AbortController();
		let url: string | undefined;
		peaks = undefined;
		loaded = undefined;
		fetch(from, { signal: stop.signal })
			.then((response) => {
				if (!response.ok) throw new Error(`${response.status}`);
				const type = response.headers.get('Content-Type') ?? '';
				return response.arrayBuffer().then((bytes) => ({ bytes, type }));
			})
			.then(({ bytes, type }) => {
				// (the blob first: decoding takes the bytes away)
				loaded = url = URL.createObjectURL(new Blob([bytes], { type }));
				return waveform(bytes).then(
					// (unless another sound took its place while this one was decoded)
					(found) => void (stop.signal.aborted || (peaks = found)),
					() => {} // a flat line, then: it may still play
				);
			})
			.catch(() => {
				if (!stop.signal.aborted) fail();
			});
		return () => {
			stop.abort();
			if (url) URL.revokeObjectURL(url);
		};
	});

	const fail = () => (onfail ? onfail() : (failed = true));

	const progress = $derived(duration ? currentTime / duration : 0);
	const width = $derived(span && duration ? Math.min(1, duration / span) : 1);
	let bars = $state<HTMLElement>();
	let barsWidth = $state(0);
	/** A bar 3px wide, and 1px between: as many as fit, each as loud as the loudest it covers. */
	const shown = $derived.by(() => {
		const count = Math.max(4, Math.min(STEPS, Math.floor((barsWidth + 1) / 4)));
		if (!peaks) return Array<number>(count).fill(0);
		return Array.from({ length: count }, (_, bar) =>
			Math.max(
				...peaks!.slice(
					Math.floor((bar * STEPS) / count),
					Math.max(Math.floor(((bar + 1) * STEPS) / count), Math.floor((bar * STEPS) / count) + 1)
				)
			)
		);
	});

	/** Asked to play before the sound was there: it plays once it is. */
	let waiting = $state(false);
	$effect(() => {
		if (waiting && loaded && audio) {
			waiting = false;
			toggle();
		}
	});

	function toggle() {
		if (!audio) return;
		if (!loaded) {
			near = true;
			waiting = !waiting;
			return;
		}
		if (!paused) return audio.pause();
		if (playing !== audio) playing?.pause();
		playing = audio;
		void audio.play();
	}

	function seek(to: number) {
		if (!audio || !duration) return;
		audio.currentTime = Math.min(duration, Math.max(0, to));
	}

	function onkeydown(event: KeyboardEvent) {
		const by = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
		if (by !== undefined) seek(currentTime + by * Math.max(0.1, duration / 20));
		else if (event.key === 'Home') seek(0);
		else if (event.key === 'End') seek(duration);
		else return;
		event.preventDefault();
	}
</script>

<div class="flex items-center gap-3" {@attach nearby}>
	<audio
		bind:this={audio}
		bind:paused
		bind:currentTime
		bind:duration
		src={loaded}
		preload="metadata"
		onerror={() => loaded && fail()}
	></audio>
	{#if failed}
		<p class="text-sm text-muted">This sound could not be played.</p>
	{:else}
		<Button
			icon={paused ? 'icon-[lucide--play]' : 'icon-[lucide--pause]'}
			label={paused ? `Play ${caption ?? label}` : `Pause ${caption ?? label}`}
			onclick={toggle}
		/>
		{#if caption}<span class="w-12 shrink-0 label">{caption}</span>{/if}
		<div
			role="slider"
			tabindex="0"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={Math.round(duration)}
			aria-valuenow={Math.round(currentTime)}
			aria-valuetext={`${time(currentTime, duration)} of ${time(duration, duration)}`}
			class="flex h-8 min-w-0 flex-1 cursor-pointer items-center rounded-control"
			onclick={(event) => {
				const box = bars!.getBoundingClientRect();
				seek(((event.clientX - box.left) / box.width) * duration);
			}}
			{onkeydown}
		>
			<div
				bind:this={bars}
				bind:clientWidth={barsWidth}
				class="flex h-full items-center gap-px"
				style:width={`${width * 100}%`}
			>
				{#each shown as peak, index (index)}
					<span
						class={[
							'min-h-0.5 flex-1 rounded-full transition-colors',
							index / shown.length < progress ? 'bg-accent' : 'bg-muted/40'
						]}
						style:height={`${Math.max(peak, 0.06) * 100}%`}
					></span>
				{/each}
			</div>
		</div>
		<!-- how long it is, until it plays: then where it is -->
		<span class="w-14 shrink-0 text-right text-xs whitespace-nowrap text-muted tabular-nums">
			{time(paused && !currentTime ? duration : currentTime, duration)}
		</span>
	{/if}
</div>
