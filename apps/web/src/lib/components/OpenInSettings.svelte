<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import { problemOf } from '#lib/problem.ts';
	import type { OpenInSettings, OpenInApp } from '#lib/open-in.ts';
	let {
		settings,
		onsave
	}: { settings: OpenInSettings; onsave: (next: OpenInSettings) => Promise<unknown> } = $props();
	let draft = $state<OpenInSettings>();
	let saving = $state(false);
	let problem = $state('');
	const apps = $derived((draft ?? settings).apps);
	const first = $derived(apps.find((app) => app.enabled)?.id);
	function change(next: OpenInApp[]) {
		draft = { revision: draft?.revision ?? settings.revision, apps: next };
	}
	function edit(id: string, values: Partial<OpenInApp>) {
		change(apps.map((app) => (app.id === id ? { ...app, ...values } : app)));
	}
	function move(index: number, delta: number) {
		const next = [...apps];
		next.splice(index + delta, 0, ...next.splice(index, 1));
		change(next);
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!draft) return;
		saving = true;
		problem = '';
		try {
			await onsave($state.snapshot(draft));
			draft = undefined;
		} catch (error) {
			problem = problemOf(error, 'Could not save apps');
		} finally {
			saving = false;
		}
	}
</script>

<h2 class="heading">Open in…</h2>
<p class="mt-1 text-sm text-muted">
	Run these commands from the workspace folder on the daemon’s machine. The first enabled app is the
	default.
</p>
<form onsubmit={save}>
	<fieldset disabled={saving} class="mt-5 space-y-3">
		{#each apps as app, i (app.id)}
			<div class="space-y-2 card p-3">
				<div class="flex items-center justify-between gap-2">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							class="cursor-pointer accent-accent"
							checked={app.enabled}
							onchange={(e) => edit(app.id, { enabled: e.currentTarget.checked })}
						/>
						Enabled{app.id === first ? ' · Default' : ''}
					</label>
					<div class="tools">
						<Button
							type="button"
							variant="ghost"
							icon="icon-[lucide--arrow-up]"
							label="Move {app.name || 'app'} up"
							disabled={!i}
							onclick={() => move(i, -1)}
						/>
						<Button
							type="button"
							variant="ghost"
							icon="icon-[lucide--arrow-down]"
							label="Move {app.name || 'app'} down"
							disabled={i === apps.length - 1}
							onclick={() => move(i, 1)}
						/>
						<Button
							type="button"
							variant="ghost"
							icon="icon-[lucide--trash-2]"
							label="Remove {app.name || 'app'}"
							onclick={() => change(apps.filter((other) => other.id !== app.id))}
						/>
					</div>
				</div>
				<div class="grid gap-3 sm:grid-cols-3">
					<label class="grid gap-1 text-xs text-muted">
						Name<input
							required
							class="input text-sm text-ink"
							placeholder="Zed"
							value={app.name}
							oninput={(e) => edit(app.id, { name: e.currentTarget.value })}
						/>
					</label>
					<label class="grid gap-1 text-xs text-muted sm:col-span-2">
						Shell command<input
							required
							class="input code text-ink"
							placeholder="zed ."
							value={app.command}
							oninput={(e) => edit(app.id, { command: e.currentTarget.value })}
						/>
					</label>
				</div>
			</div>
		{/each}
		<div class="flex items-center gap-2">
			<Button
				type="button"
				icon="icon-[lucide--plus]"
				onclick={() =>
					change([...apps, { id: crypto.randomUUID(), name: '', command: '', enabled: true }])}
			>
				Add app
			</Button>
			{#if draft}
				<Button type="submit" variant="primary" busy={saving}>Save changes</Button>
				<Button
					type="button"
					variant="ghost"
					onclick={() => {
						draft = undefined;
						problem = '';
					}}
				>
					Discard
				</Button>
			{/if}
		</div>
	</fieldset>
	{#if problem}<Notice>{problem}</Notice>{/if}
</form>
