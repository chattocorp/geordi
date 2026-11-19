<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Composer from './Composer.svelte';
	import Button from './Button.svelte';
	import { hint, pressed } from './keys.ts';

	let {
		value = $bindable(''),
		running = false,
		waiting = false,
		empty = false,
		options,
		meter,
		onstop,
		sendButton = { type: 'submit', name: 'mode', value: 'steer' },
		queueButton = { type: 'submit', name: 'mode', value: 'queue' },
		...props
	}: Omit<
		ComponentProps<typeof Composer>,
		'footer' | 'placeholder' | 'rows' | 'live' | 'onkeydown'
	> & {
		running?: boolean;
		waiting?: boolean;
		empty?: boolean;
		options?: Snippet;
		meter?: Snippet;
		onstop: () => void;
		sendButton?: HTMLButtonAttributes;
		queueButton?: HTMLButtonAttributes;
	} = $props();
	/**
	 * Enter says it now (steering the agent if it is working); with Cmd or Ctrl it waits for
	 * the agent to finish. Each is one of the form's submit buttons, pressed for the user.
	 */
	function keys(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
		event.preventDefault();
		const { form } = event.currentTarget;
		const mode = running && pressed(event, 'queue') ? 'queue' : 'steer';
		form?.requestSubmit(form.querySelector<HTMLButtonElement>(`button[value=${mode}]`));
	}
</script>

<Composer
	{...props}
	bind:value
	rows={2}
	live={running && !waiting}
	onkeydown={keys}
	placeholder={running
		? 'Steer the agent, or queue a message'
		: empty
			? 'What should the agent do?'
			: 'Reply to the agent'}
>
	{#snippet footer()}
		<!-- In narrow working composers, reserve the row for Stop, Queue, and Steer. -->
		<div
			class={[
				'min-w-0 flex-wrap items-center gap-1',
				running && !waiting ? 'hidden @lg:flex' : 'flex'
			]}
		>
			{#if waiting}
				<span class="text-xs text-muted" role="status">Waiting for daemon</span>
			{:else}{@render options?.()}{/if}
			{@render meter?.()}
		</div>
		<div class="ml-auto flex h-9 items-center gap-2">
			<!-- how to send: said while writing, and where there is room for it -->
			<p
				class="invisible hidden pr-1 text-xs whitespace-nowrap text-muted group-focus-within/composer:visible @4xl:block"
			>
				{running
					? `Enter to steer, ${hint('queue')} to queue`
					: 'Enter to send, Shift+Enter for a new line'}
			</p>
			{#if running}
				<Button icon="icon-[lucide--square]" label="Stop the agent" onclick={onstop} />
				<Button
					{...queueButton}
					icon="icon-[lucide--list-plus]"
					label="Queue: send this when the agent is done"
				>
					Queue
				</Button>
				<Button
					{...sendButton}
					variant="primary"
					icon="icon-[lucide--corner-down-right]"
					label="Steer: send to the working agent"
				>
					Steer
				</Button>
			{:else}
				<Button {...sendButton} variant="primary" icon="icon-[lucide--arrow-up]" label="Send" />
			{/if}
		</div>
	{/snippet}
</Composer>
