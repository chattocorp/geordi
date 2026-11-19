<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { Changes, Upstream } from '@geordi/protocol';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import WorkspaceActions from '@geordi/ui/WorkspaceActions.svelte';
	import TitleBar from '@geordi/ui/TitleBar.svelte';
	import PullRequestPane from '@geordi/ui/PullRequestPane.svelte';
	import PullRequestTab from '@geordi/ui/PullRequestTab.svelte';
	import PaneTabs from '@geordi/ui/PaneTabs.svelte';
	import DiffView from '@geordi/ui/DiffView.svelte';
	import ChangesPane from '@geordi/ui/Changes.svelte';
	import ReplyComposer from '@geordi/ui/ReplyComposer.svelte';
	import AgentAvatar from '@geordi/ui/AgentAvatar.svelte';
	import UserMessage from '@geordi/ui/UserMessage.svelte';
	import AgentMessage from '@geordi/ui/AgentMessage.svelte';
	import AgentText from '@geordi/ui/AgentText.svelte';
	import TurnActivity from '@geordi/ui/TurnActivity.svelte';
	import ToolGroup from '@geordi/ui/ToolGroup.svelte';
	import Spinner from '@geordi/ui/Spinner.svelte';
	import { actionsFor, standingOf, type WorkspaceAction } from '@geordi/ui/actions';

	import { files, hold, last, loginDiff, message, others, tools } from './demo.ts';
	let step = $state(last);
	let draft = $state('');
	let editing = false;
	let hydrated = $state(false);
	let stopped = $state(false);
	const running = $derived(step >= 1 && step < 7 && !stopped);
	let firstMessage = $state(message);
	let replies = $state<string[]>([]);
	let queue = $state<string[]>([]);
	let transcript: HTMLDivElement;
	function submitReply(event: SubmitEvent) {
		event.preventDefault();
		const text = draft.trim();
		if (!text) return;
		if (step === 0) {
			firstMessage = text;
			go(1);
		} else {
			const queued = running && (event.submitter as HTMLButtonElement | null)?.value === 'queue';
			if (queued) queue.push(text);
			else replies.push(text);
			stopped = false;
		}
		draft = '';
		editing = false;
		schedule();
		void tick().then(() => {
			transcript.scrollTop = transcript.scrollHeight;
		});
	}
	function deliverQueued() {
		replies.push(...queue);
		queue = [];
	}
	function stopDemo() {
		deliverQueued();
		stopped = true;
		clearTimeout(timer);
	}

	let playing = $state(false);
	const replyStart = 'People now return to the page they asked for. The sign-in form carries it as';
	const replyEnd = ', and only paths on this site are accepted. Tests pass.';
	let activityOpen = $state(false);
	const calls = $derived(
		tools
			.filter((tool) => step >= tool.step)
			.map((tool) => ({
				...tool,
				isError: false,
				output: step === tool.step ? null : tool.output
			}))
	);
	let visible = false;
	let timer: ReturnType<typeof setTimeout>;
	let frame: HTMLElement;
	let pullTab = $state<'closed' | 'background' | 'active'>('closed');
	function selectMainTab(id: string) {
		if (id === 'pull') pullTab = 'active';
		else if (pullTab !== 'closed') pullTab = 'background';
		schedule();
	}
	async function openPull() {
		selectMainTab('pull');
		await tick();
		document.getElementById(uid + '-chat-tab-1')?.focus();
	}
	function closePull() {
		pullTab = 'closed';
		document.getElementById(uid + '-chat-tab-0')?.focus();
		schedule();
	}
	const narrow = new MediaQuery('(max-width: 40rem)', true);
	const uid = $props.id();
	let opened = $state<string[]>([]);
	let selected = $state<string | null>(null);
	let diffReady = $state(false);
	function openDiff(path: string) {
		if (selected === path) return;
		const tabs = opened.length ? opened : file ? [file.path] : [];
		opened = tabs.includes(path) ? tabs : [...tabs, path];
		diffReady = false;
		selected = path;
		if (step === last) schedule();
	}
	const file = $derived(files.find((f) => f.path === selected) ?? (step >= 4 ? files[1] : null));
	const diffTabs = $derived(opened.length ? opened : [file?.path ?? 'Diff']);
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
						review: step === 8 ? 'pending' : 'approved',
						body: 'Return people to the page they requested after sign-in. Validate the destination so redirects stay on this site.',
						checks: {
							state: step === 8 ? 'pending' : 'success',
							total: 1,
							items: [
								{
									id: 'tests',
									name: 'Sign-in redirect tests',
									state: step === 8 ? 'pending' : 'success',
									status: step === 8 ? 'in_progress' : 'success'
								}
							],
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
		if (
			!playing ||
			!visible ||
			editing ||
			stopped ||
			activityOpen ||
			pullTab === 'active' ||
			(step === last && (replies.length || selected))
		)
			return;
		if (step === 0 && draft.length < message.length) {
			timer = setTimeout(
				() => {
					draft = message.slice(0, draft.length + 1);
					schedule();
				},
				draft.length === 0 ? 700 : 24
			);
		} else timer = setTimeout(() => go(step === last ? 0 : step + 1), hold[step]);
	}
	function go(next: number) {
		if (running && next >= 7) deliverQueued();
		if (step === 0) draft = '';
		step = next;
		activityOpen = false;
		if (step === 0) {
			draft = '';
			editing = false;
			stopped = false;
			replies = [];
			queue = [];
			firstMessage = message;
			pullTab = 'closed';
			selected = null;
			opened = [];
		}
		schedule();
	}
	function act(action: WorkspaceAction) {
		if (action.id === 'create-pull') go(8);
		if (action.id === 'merge-pull') go(10);
		if (action.id === 'archive' || action.id === 'continue') go(0);
	}

	onMount(() => {
		hydrated = true;
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		function updateMotion() {
			pullTab = 'closed';
			playing = !motion.matches;
			selected = null;
			opened = [];
			editing = false;
			draft = '';
			stopped = false;
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
	<TitleBar>
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
					onopenpull={openPull}
					onaction={act}
				/>
			</div>
		{/if}
	</TitleBar>

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
									working={running}
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
			<PaneTabs
				prefix="{uid}-chat"
				tabs={pullTab === 'closed' ? ['chat'] : ['chat', 'pull']}
				current={pullTab === 'active' ? 'pull' : 'chat'}
				onselect={selectMainTab}
				closable={(id) => id === 'pull'}
				onclose={closePull}
			>
				{#snippet tab(id: string)}
					{#if id === 'pull' && upstream.pull}<PullRequestTab pull={upstream.pull} />
					{:else}<span class="icon-[lucide--sparkles] size-3.5 text-claude"></span>Claude{/if}
				{/snippet}
			</PaneTabs>
			<div
				role="tabpanel"
				hidden={pullTab === 'active'}
				id="{uid}-chat-panel-0"
				aria-labelledby="{uid}-chat-tab-0"
				class="flex min-h-0 flex-1 flex-col"
			>
				<div bind:this={transcript} class="scroller flex min-h-0 flex-1 flex-col gap-4 px-5 pb-4">
					{#if step === 0}<p class="m-auto max-w-xs text-center text-sm text-balance text-muted">
							Say what you want done.
						</p>
					{:else}
						<div class="mt-auto pt-4"><UserMessage text={firstMessage} /></div>
						<AgentMessage agent="claude">
							{#if step >= 7}
								<TurnActivity
									summary={`${calls.length} tool calls`}
									expanded={activityOpen}
									ontoggle={() => {
										activityOpen = !activityOpen;
										schedule();
									}}
								/>
							{/if}
							{#if calls.length && (step < 7 || activityOpen)}<ToolGroup
									tools={calls}
									live={running}
								/>{/if}
							{#if step === 1 && running}<p class="flex h-7 items-center gap-2 text-xs text-muted">
									<Spinner /> Working
								</p>{/if}
							{#if step >= 7}
								<AgentText text={`${replyStart} \`returnTo\`${replyEnd}`}>
									<div class="prose"><p>{replyStart} <code>returnTo</code>{replyEnd}</p></div>
								</AgentText>
							{/if}
							{#if step >= 8}
								<button
									type="button"
									class="flex items-center gap-2 text-sm text-muted hover:text-ink"
									onclick={openPull}
								>
									<span class="icon-[lucide--git-pull-request] size-3.5"></span>Opened pull request
									#412
								</button>
							{/if}
						</AgentMessage>
						{#if stopped}<p class="text-xs text-muted" role="status">Agent stopped</p>{/if}
						{#each replies as text, index (index)}<UserMessage {text} />{/each}
						{#each queue as text, index (index)}
							<div class="ml-auto message ring-1 ring-line">
								<p class="label">Queued</p>
								<p class="whitespace-pre-wrap">{text}</p>
							</div>
						{/each}
					{/if}
				</div>
				<div class="mx-3 mb-3">
					<ReplyComposer
						bind:value={draft}
						disabled={!hydrated}
						{running}
						empty={step === 0}
						form={{
							onsubmit: submitReply,
							onfocusin: () => {
								if (step === 0) {
									editing = true;
									clearTimeout(timer);
								}
							},
							oninput: () => {
								editing = true;
								clearTimeout(timer);
							},
							onfocusout: (event) => {
								if (
									!event.currentTarget.contains(event.relatedTarget as Node | null) &&
									(step === 0 ? message.startsWith(draft) : !draft)
								) {
									editing = false;
									schedule();
								}
							}
						}}
						onstop={stopDemo}
					>
						{#snippet options()}<span class="inline-flex items-center gap-1.5 text-sm text-muted"
								><AgentAvatar agent="claude" bare />Claude</span
							>{/snippet}
					</ReplyComposer>
				</div>
			</div>
			{#if pullTab !== 'closed' && upstream.pull}
				<div
					role="tabpanel"
					id="{uid}-chat-panel-1"
					aria-labelledby="{uid}-chat-tab-1"
					hidden={pullTab !== 'active'}
					class="flex min-h-0 flex-1 flex-col"
				>
					<PullRequestPane pull={upstream.pull} />
				</div>
			{/if}
		</section>

		<!-- beside it: what has changed, and one of the diffs -->
		<div class="hidden w-80 shrink-0 flex-col gap-2 md:flex xl:w-96">
			<section class="flex min-h-0 flex-2 flex-col sheet-quiet">
				<PaneTabs prefix="{uid}-changes" tabs={['Changes']} current="Changes">
					{#snippet tab(id: string)}{id}{/snippet}
				</PaneTabs>
				<div
					role="tabpanel"
					id="{uid}-changes-panel-0"
					aria-labelledby="{uid}-changes-tab-0"
					class="flex min-h-0 flex-1 flex-col"
				>
					<ChangesPane {git} onopen={openDiff} />
				</div>
			</section>
			<section class="flex min-h-0 flex-3 flex-col sheet-quiet">
				<PaneTabs
					prefix="{uid}-diff"
					tabs={diffTabs}
					current={file?.path ?? 'Diff'}
					onselect={(id) => {
						if (id !== 'Diff') openDiff(id);
					}}
				>
					{#snippet tab(id: string)}<span class={['truncate', file && 'code-dense']}
							>{id.split('/').at(-1)}</span
						>{/snippet}
				</PaneTabs>
				{#each diffTabs as path, index (path)}
					<div
						role="tabpanel"
						id="{uid}-diff-panel-{index}"
						aria-labelledby="{uid}-diff-tab-{index}"
						hidden={path !== (file?.path ?? 'Diff')}
						class="min-h-0 overflow-hidden"
					>
						{#if path === (file?.path ?? 'Diff')}
							<p class="px-3.5 py-2 text-sm text-muted" hidden={!!file}>
								Diffs fill in as the agent writes.
							</p>
							{#if selected && file}
								{#key file.path}
									<div class="scroller h-full">
										{#if !diffReady}<p
												class="flex items-center gap-2 p-5 text-sm text-muted"
												role="status"
											>
												<Spinner label="Loading the diff" /> Loading the diff…
											</p>{/if}
										<DiffView
											path={file.path}
											old={file.old}
											new={file.new}
											bind:ready={diffReady}
										/>
									</div>
								{/key}
							{:else if file}
								<pre
									class="overflow-hidden py-1 code-dense">{#each loginDiff as [sign, line], index (index)}<span
											class={[
												'block px-3.5',
												sign === '+' && 'bg-ok/12',
												sign === '-' && 'bg-danger-soft'
											]}
											><span
												class={[
													'inline-block w-4 select-none',
													sign === '+' ? 'text-ok' : 'text-danger'
												]}>{sign.trim()}</span
											>{line}</span
										>{/each}</pre>
							{/if}
						{/if}
					</div>{/each}
			</section>
		</div>
	</div>
</figure>

<p class="mt-3 flex items-center gap-3 px-1 text-sm text-muted">
	<span class="mr-auto">
		Follow a fix from the first message to a merged pull request. Replies stay in this demo.
	</span>
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
