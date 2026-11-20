<script lang="ts">
	import Button from '@geordi/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import { problemOf } from '#lib/problem.ts';
	import { registerRepo } from '../../routes/repos.remote';

	let { onadded }: { onadded: (repo: { id: string; name: string }) => void } = $props();
	let open = $state(false);
	let busy = $state(false);
	let path = $state('');
	let problem = $state('');
	let input = $state<HTMLInputElement>();

	type ChooseFolder = () => Promise<string | null>;
	let chooseFolder = $state<ChooseFolder>();

	export function start() {
		if (busy || open) return;
		problem = path = '';
		chooseFolder = (window as { geordiDesktop?: { chooseRepository?: ChooseFolder } }).geordiDesktop
			?.chooseRepository;
		if (chooseFolder) void add();
		else open = true;
	}

	async function add() {
		if (busy) return;
		busy = true;
		try {
			const folder = chooseFolder ? await chooseFolder() : path.trim();
			if (!folder) return;
			const repo = await registerRepo(folder);
			open = false;
			onadded(repo);
		} catch (error) {
			problem = problemOf(error, 'Could not add the repository');
			open = true;
		} finally {
			busy = false;
		}
	}
</script>

<Dialog bind:open label="Add repository" class="max-w-md" onopen={() => input?.focus()}>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void add();
		}}
		class="space-y-4 p-5"
	>
		<h2 class="heading">Add repository</h2>
		{#if !chooseFolder}
			<label class="grid gap-1 text-sm">
				Git repository folder on the Geordi host
				<input
					bind:this={input}
					bind:value={path}
					placeholder="~/src/my-project"
					class="input code"
					autocomplete="off"
					spellcheck="false"
				/>
			</label>
		{/if}
		{#if problem}<Notice>{problem}</Notice>{/if}
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" variant="primary" {busy} disabled={!chooseFolder && !path.trim()}
				>{chooseFolder ? 'Choose folder…' : 'Add repository'}</Button
			>
		</div>
	</form>
</Dialog>
