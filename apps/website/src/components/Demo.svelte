<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { Changes, Upstream } from '@geordi/protocol';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import WorkspaceActions from '@geordi/ui/WorkspaceActions.svelte';
	import ChangesPane from '@geordi/ui/Changes.svelte';
	import Spinner from '@geordi/ui/Spinner.svelte';
	import { actionsFor, standingOf, type WorkspaceAction } from '@geordi/ui/actions';

	import { files, hold, last, message, others, tools } from './demo.ts';
	let step = $state(last);
	let typed = $state(0);
	let playing = $state(false);
	let visible = false;
	let timer: ReturnType<typeof setTimeout>;
	let frame: HTMLElement;
	let pullInfo: HTMLDialogElement;
	const narrow = new MediaQuery('(max-width: 40rem)', true);
	let selected = $state<string | null>(null);
	const file = $derived(files.find((f) => f.path === selected) ?? (step >= 4 ? files[1] : null));
	const branch = 'geordi/return-after-sign-in';
	const changedFiles = $derived(files.filter((file) => step >= file.step));
	const changes: Changes = $derived({
		branch,
		comparisonTarget: 'main',
		files: changedFiles,
		uncommitted: step < 8 ? changedFiles.length : 0,
		unpushed: 0,
		landed: step === last
	});
	const upstream: Upstream = $derived({
		forge: 'github',
		repo: 'chatto/chatto',
		repoUrl: null,
		branch,
		pushed: step >= 8,
		createUrl: null,
		pull:
			step < 8
				? null
				: {
						number: '412',
						title: 'Return people after sign-in',
						url: null,
						state: step === last ? 'merged' : 'open',
						draft: false,
						base: 'main',
						review: null,
						checks: {
							state: step === 8 ? 'pending' : 'success',
							total: 1,
							failed: 0,
							url: null,
							counts: {
								passed: step === 8 ? 0 : 1,
								pending: step === 8 ? 1 : 0,
								failed: 0,
								skipped: 0
							}
						}
					}
	});
	const git = $derived({ changes, upstream, unavailable: null });
	const standing = $derived(standingOf(git));
	const actions = $derived(actionsFor(git));
	const at = (from: number, until = last + 1) => ({
		'data-from': from,
		hidden: step < from || step >= until
	});

	function schedule() {
		clearTimeout(timer);
		if (!playing || !visible || pullInfo?.open) return;
		if (step === 0 && typed < message.length) {
			timer = setTimeout(
				() => {
					typed++;
					schedule();
				},
				typed === 0 ? 700 : 24
			);
		} else timer = setTimeout(() => go(step === last ? 0 : step + 1), hold[step]);
	}
	function go(next: number) {
		step = next;
		if (step === 0) {
			typed = 0;
			selected = null;
		}
		schedule();
	}
	function act(action: WorkspaceAction) {
		if (action.id === 'create-pull') go(8);
		if (action.id === 'merge-pull') go(10);
		if (action.id === 'archive' || action.id === 'continue') go(0);
	}

	onMount(() => {
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		function updateMotion() {
			if (pullInfo.open) pullInfo.close();
			playing = !motion.matches;
			selected = null;
			go(playing ? 0 : last);
		}
		updateMotion();
		motion.addEventListener('change', updateMotion);
		const observer = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			schedule();
		});
		observer.observe(frame);
		return () => {
			clearTimeout(timer);
			observer.disconnect();
			motion.removeEventListener('change', updateMotion);
		};
	});
</script>

<figure
	class="overflow-hidden rounded-card bg-frame shadow-float ring-1 ring-line/60"
	data-demo
	bind:this={frame}
	data-playing={playing || undefined}
	aria-label="A Geordi workspace, playing through a piece of work"
>
	<!-- the window's title bar: what the workspace is, and the ribbon that says what is next -->
	<div class="flex h-14 items-center gap-3 pr-3 pl-5">
		<span class="flex gap-2" aria-hidden="true">
			<span class="size-3 rounded-full bg-muted/25"></span>
			<span class="size-3 rounded-full bg-muted/25"></span>
			<span class="size-3 rounded-full bg-muted/25"></span>
		</span>
		<span class="ml-2 icon-[lucide--panel-left] hidden size-4 shrink-0 text-muted sm:block"></span>
		<p class="min-w-0 truncate heading text-muted" {...at(0, 1)}>New workspace</p>
		<p class="min-w-0 truncate heading" {...at(1)}>Return people after sign-in</p>
		<span class="hidden min-w-0 truncate code-dense text-muted xl:block" {...at(1)}>
			geordi/return-after-sign-in
		</span>

		{#if step >= 7}
			<div class="ml-auto">
				<WorkspaceActions
					{standing}
					{actions}
					disabled={!playing}
					pull={upstream.pull}
					compact={narrow.current}
					onopenpull={() => {
						clearTimeout(timer);
						pullInfo.showModal();
					}}
					onaction={act}
				/>
			</div>
		{/if}
	</div>

	<div class="flex h-120 gap-2 px-2 pb-2 sm:h-136">
		<!-- the sidebar: every workspace, and how its work stands -->
		<aside class="hidden w-64 shrink-0 flex-col sheet-quiet lg:flex">
			<div class="flex-1 space-y-5 p-2">
				<p class="item gap-2.5 px-2.5 py-1.5 text-base">
					<span class="icon-[lucide--layout-grid] size-4 shrink-0"></span>
					Overview
				</p>
				<div>
					<p class="flex h-7 items-center gap-2 px-1.5 text-sm font-semibold text-muted">
						<span
							class="grid size-5 place-items-center rounded-control bg-codex/20 text-xs text-codex"
						>
							c
						</span>
						chatto
					</p>
					<ul class="space-y-px">
						{#if step > 0}
							<li>
								<WorkspaceRow
									title="Return people after sign-in"
									current
									working={step < 7}
									{standing}
									{actions}
									onaction={playing && step >= 7 ? act : undefined}
								/>
							</li>
						{/if}
						<li>
							<WorkspaceRow
								title="Paginate the audit log"
								working={step < 6}
								asking={step >= 6}
								unread={step >= 6}
							/>
						</li>
						{#each others as other (other.title)}
							<li><WorkspaceRow {...other} /></li>
						{/each}
					</ul>
				</div>
			</div>
			<p class="m-2 item gap-2.5 px-2.5 py-1.5 text-base">
				<span class="icon-[lucide--settings] size-4 shrink-0"></span>
				Settings
			</p>
		</aside>

		<!-- the conversation -->
		<section class="flex min-w-0 flex-1 flex-col sheet">
			<div class="pane-bar gap-1 px-2">
				<p class="item h-7 tab-active px-2">
					<span class="icon-[lucide--sparkles] size-3.5 text-claude"></span>
					Claude
				</p>
			</div>
			<div class="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-hidden px-5 pb-4">
				<p class="m-auto max-w-xs text-center text-sm text-balance text-muted" {...at(0, 1)}>
					Say what you want done.
				</p>
				<p class="ml-auto message bg-bubble" {...at(1)}>
					{message}
				</p>
				<div class="flex gap-3.5" {...at(1)}>
					<span
						class="grid size-8 shrink-0 place-items-center rounded-control bg-claude/15 text-claude"
					>
						<span class="icon-[lucide--sparkles] size-4.5"></span>
					</span>
					<div class="min-w-0 flex-1 pt-0.5">
						{#each tools as tool (tool.step)}
							<p class="flex h-7 items-center gap-2 text-sm text-muted" {...at(tool.step)}>
								<span class={['size-3.5 shrink-0', tool.icon]}></span>
								<span class="shrink-0 font-medium">{tool.name}</span>
								<span class="min-w-0 truncate code-dense">{tool.what}</span>
							</p>
						{/each}
						<p class="flex h-7 items-center gap-2 text-xs text-muted" {...at(1, 7)}>
							<Spinner /> Working
						</p>
						<p class="mt-2 max-w-prose" {...at(7)}>
							People now return to the page they asked for. The sign-in form carries it as
							<code class="code text-(--inline-code)">returnTo</code>, and only paths on this site
							are accepted. Tests pass.
						</p>
						<p class="mt-3 flex items-center gap-2 text-sm text-muted" {...at(8)}>
							<span class="icon-[lucide--git-pull-request] size-3.5"></span>
							Opened pull request #412
						</p>
					</div>
				</div>
			</div>
			<!-- the reply box: a light goes round its edge while the agent works -->
			<div
				class="edge-live m-3 mt-0 card-float pt-2"
				data-live={step >= 1 && step < 7 ? true : undefined}
			>
				<p
					class="min-h-13 px-4 py-1"
					data-typing={step === 0 && typed < message.length ? true : undefined}
					aria-hidden="true"
					hidden={step !== 0}
				>
					{message.slice(0, typed)}
				</p>
				<p class="min-h-13 px-4 py-1 text-muted/70" hidden={step === 0}>Reply to Claude</p>
				<div class="flex items-center gap-1 px-3 pb-3 text-sm text-muted">
					<span class="flex h-7 items-center gap-1.5 px-1.5">
						<span class="icon-[lucide--sparkles] size-3.5 text-claude"></span>
						Claude
					</span>
					<span class="hidden h-7 items-center gap-1.5 px-1.5 sm:flex">
						<span class="icon-[lucide--shield] size-3.5"></span>
						Auto Mode
					</span>
					<span
						class="ml-auto grid size-8 place-items-center rounded-full bg-accent text-on-accent"
					>
						<span class="icon-[lucide--arrow-up] size-4"></span>
					</span>
				</div>
			</div>
		</section>

		<!-- beside it: what has changed, and one of the diffs -->
		<div class="hidden w-80 shrink-0 flex-col gap-2 md:flex xl:w-96">
			<section class="flex min-h-0 flex-2 flex-col sheet-quiet">
				<div class="pane-bar px-2">
					<p class="item h-7 tab-active px-2">Changes</p>
				</div>
				<ChangesPane {git} onopen={(path) => (selected = path)} />
			</section>
			<section class="flex min-h-0 flex-3 flex-col sheet-quiet">
				<div class="pane-bar px-2">
					<p class="item h-7 tab-active px-2 code-dense" hidden={!file}>
						{file?.path.split('/').at(-1)}
					</p>
					<p class="item h-7 px-2 tab-inactive" hidden={!!file}>Diff</p>
				</div>
				<p class="px-3.5 py-2 text-sm text-muted" hidden={!!file}>
					Diffs fill in as the agent writes.
				</p>
				{#if file}
					<pre
						class="overflow-hidden py-1 code-dense">{#each file.lines as [sign, line], index (index)}<span
								class={[
									'block px-3.5',
									sign === '+' && 'bg-ok/12',
									sign === '-' && 'bg-danger-soft'
								]}
								><span
									class={['inline-block w-4 select-none', sign === '+' ? 'text-ok' : 'text-danger']}
									>{sign.trim()}</span
								>{line}</span
							>{/each}</pre>
				{/if}
			</section>
		</div>
	</div>
	<dialog
		aria-labelledby="demo-pull-title"
		bind:this={pullInfo}
		onclose={schedule}
		class="m-auto card-float p-5 text-ink"
	>
		<p id="demo-pull-title" class="heading">#412 · {upstream.pull?.title}</p>
		<p class="my-3 text-sm text-muted">{standing?.label}</p>
		<form method="dialog"><button class="item px-3 py-1">Close</button></form>
	</dialog>
</figure>

<p class="mt-3 flex items-center gap-3 px-1 text-sm text-muted">
	<span class="mr-auto"> Follow a fix from the first message to a merged pull request. </span>
	<button
		type="button"
		hidden={!playing}
		class="inline-flex shrink-0 items-center gap-1.5 rounded-control whitespace-nowrap hover:text-ink"
		onclick={() => go(0)}
	>
		<span class="icon-[lucide--rotate-ccw] size-3.5 shrink-0"></span>
		Play again
	</button>
</p>
