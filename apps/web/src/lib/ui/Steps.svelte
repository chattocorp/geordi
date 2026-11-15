<script lang="ts" generics="T extends string">
	type Props = {
		/** What is being set; read out, not shown. */
		label: string;
		/** The levels, the lowest first. */
		steps: { value: T; label: string }[];
		value?: T;
	};
	let { label, steps, value = $bindable() }: Props = $props();

	const at = $derived(
		Math.max(
			0,
			steps.findIndex((step) => step.value === value)
		)
	);
	const set = (index: number) =>
		(value = steps[Math.max(0, Math.min(steps.length - 1, index))].value);

	function onkeydown(event: KeyboardEvent) {
		const to = {
			ArrowLeft: at - 1,
			ArrowDown: at - 1,
			ArrowRight: at + 1,
			ArrowUp: at + 1,
			Home: 0,
			End: steps.length - 1
		}[event.key];
		if (to === undefined) return;
		event.preventDefault();
		set(to);
	}
</script>

<!--
	A level among a few, as a row of rising bars lit up to the one chosen: click a bar, or
	use the arrow keys. For things that go from less to more.
-->
<div
	role="slider"
	tabindex="0"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={steps.length - 1}
	aria-valuenow={at}
	aria-valuetext={steps[at]?.label}
	{onkeydown}
	class="flex h-6 items-end rounded-control focus-visible:outline-2 focus-visible:outline-accent"
>
	{#each steps as step, index (step.value)}
		<!-- the slider itself is what the keyboard and screen readers use -->
		<button
			type="button"
			tabindex="-1"
			aria-hidden="true"
			title={step.label}
			onclick={() => set(index)}
			class="group flex h-full w-3 items-end justify-center"
		>
			<span
				class={['w-1 rounded-full group-hover:bg-ink', index <= at ? 'bg-ink' : 'bg-muted/40']}
				style:height="{20 + (index / Math.max(1, steps.length - 1)) * 80}%"
			></span>
		</button>
	{/each}
</div>
