<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { Changes, Upstream } from '@geordi/protocol';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import WorkspaceActions from '@geordi/ui/WorkspaceActions.svelte';
	import TitleBar from '@geordi/ui/TitleBar.svelte';
	import PullRequestPane from '@geordi/ui/PullRequestPane.svelte';
	import PullRequestTab from '@geordi/ui/PullRequestTab.svelte';
	import Keys from '@geordi/ui/Keys.svelte';
	import PaneTabs from '@geordi/ui/PaneTabs.svelte';
	import DiffView from '@geordi/ui/DiffView.svelte';
	import DiffSection from '@geordi/ui/DiffSection.svelte';
	import DiffStat from '@geordi/ui/DiffStat.svelte';
	import ChangesPane from '@geordi/ui/Changes.svelte';
	import RunPane from '@geordi/ui/RunPane.svelte';
	import RunTab from '@geordi/ui/RunTab.svelte';
	import type { JobState } from '@geordi/ui/JobMark.svelte';
	import ReplyComposer from '@geordi/ui/ReplyComposer.svelte';
	import AgentAvatar from '@geordi/ui/AgentAvatar.svelte';
	import UserMessage from '@geordi/ui/UserMessage.svelte';
	import AgentMessage from '@geordi/ui/AgentMessage.svelte';
	import AgentText from '@geordi/ui/AgentText.svelte';
	import TurnActivity from '@geordi/ui/TurnActivity.svelte';
	import ToolGroup from '@geordi/ui/ToolGroup.svelte';
	import ProgressIcon from '@geordi/ui/ProgressIcon.svelte';
	import Spinner from '@geordi/ui/Spinner.svelte';
	import { actionsFor, standingOf, type WorkspaceAction } from '@geordi/ui/actions';

	import { files, hold, jobs, last, links, message, others, tools } from './demo.ts';
	let step = $state(last);
	let draft = $state('');
	let editing = false;
	let hydrated = $state(false);
	let stopped = $state(false);
	const running = $derived(step >= 1 && step < 7 && !stopped);
	let firstMessage = $state(message);
	let replies = $state<string[]>([]);
	let queue = $state<string[]>([]);
	let transcript = $state<HTMLDivElement>();
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
			if (transcript) transcript.scrollTop = transcript.scrollHeight;
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
	const uid = $props.id();
	const wide = new MediaQuery('(min-width: 48rem)', true);
	const narrow = new MediaQuery('(max-width: 40rem)', true);

	// The main area, as in the app: the conversation, and beside it what was opened from it
	// (the pull request, a file's diff, all of them at once). The demo waits while one is read.
	type MainTab = 'chat' | 'pull' | 'diff' | 'combined';
	let opened = $state<Exclude<MainTab, 'chat'>[]>([]);
	let current = $state<MainTab>('chat');
	const mainTabs = $derived<MainTab[]>(['chat', ...opened]);
	let mainWidth = $state(0);
	async function show(id: MainTab) {
		if (id !== 'chat' && !opened.includes(id)) opened.push(id);
		current = id;
		schedule();
		await tick();
		document.getElementById(`${uid}-main-tab-${mainTabs.indexOf(id)}`)?.focus();
	}
	function close(id: string) {
		opened = opened.filter((tab) => tab !== id);
		if (current === id) {
			current = 'chat';
			document.getElementById(`${uid}-main-tab-0`)?.focus();
		}
		schedule();
	}

	let selected = $state<string | null>(null);
	let diffReady = $state(false);
	function openDiff(path: string) {
		if (selected !== path) diffReady = false;
		selected = path;
		void show('diff');
	}
	const file = $derived(files.find((f) => f.path === selected));

	// The dock: a terminal, and the Run tab with what the project runs.
	let dock = $state<'terminal' | 'run'>('run');
	let jobStates = $state<Record<string, JobState>>({ db: 'running', web: 'running' });
	function start(names: string[]) {
		for (const name of names) {
			jobStates[name] = 'starting';
			setTimeout(() => {
				if (jobStates[name] === 'starting') jobStates[name] = 'running';
			}, 1200);
		}
	}

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
	const offered = $derived(actionsFor(git));
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
			current !== 'chat' ||
			(step === last && replies.length)
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
			opened = [];
			current = 'chat';
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
		hydrated = true;
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		function updateMotion() {
			playing = !motion.matches;
			opened = [];
			current = 'chat';
			selected = null;
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

{#snippet lights()}
	<span class="flex gap-2" aria-hidden="true">
		<span class="size-3 rounded-full bg-muted/25"></span>
		<span class="size-3 rounded-full bg-muted/25"></span>
		<span class="size-3 rounded-full bg-muted/25"></span>
	</span>
{/snippet}

<figure
	class="flex overflow-hidden rounded-card bg-frame shadow-float ring-1 ring-line/60"
	data-demo
	bind:this={frame}
	data-playing={playing || undefined}
	aria-label="A Geordi workspace, playing through a piece of work"
>
	<!-- the sidebar: every workspace, and how its work stands -->
	<div class="hidden w-56 shrink-0 flex-col pb-2 pl-2 lg:flex xl:w-64">
		<div class="flex h-14 shrink-0 items-center gap-4 px-3">
			{@render lights()}
			<span class="icon-[lucide--panel-left-close] size-4 text-muted"></span>
		</div>
		<aside class="flex min-h-0 flex-1 flex-col sheet-quiet">
			<div class="flex-1 p-2">
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
									actions={offered}
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
			<p class="mx-2 item gap-2.5 px-2.5 py-1.5 text-base">
				<span class="icon-[lucide--plus] size-4 shrink-0"></span>
				New workspace
			</p>
			<p class="mx-2 item gap-2.5 px-2.5 py-1.5 text-base">
				<span class="icon-[lucide--archive] size-4 shrink-0"></span>
				Archive
			</p>
			<p class="mx-2 mb-2 item gap-2.5 px-2.5 py-1.5 text-base">
				<span class="icon-[lucide--settings] size-4 shrink-0"></span>
				<span class="flex-1">Settings</span>
				<Keys id="settings" mac />
			</p>
		</aside>
	</div>

	<div class="flex min-w-0 flex-1 flex-col">
		<!-- the title bar: what the workspace is, and the ribbon that says what is next -->
		<TitleBar contentWidth={wide.current ? mainWidth : undefined}>
			<span class="hidden items-center gap-4 sm:flex lg:hidden">
				{@render lights()}
				<span class="icon-[lucide--panel-left-open] size-4 text-muted"></span>
			</span>
			<div class="min-w-0 flex-1">
				<p class="truncate heading text-muted" {...at(0, 1)}>New workspace</p>
				<p class="truncate heading" {...at(1)}>Return people after sign-in</p>
				<div class="flex items-center gap-3 overflow-hidden text-xs whitespace-nowrap text-muted">
					<span class="flex shrink-0 items-center gap-1">
						<span class="icon-[lucide--folder-git-2] size-3.5 shrink-0"></span>
						<span class="truncate">chatto</span>
					</span>
					<span class="flex min-w-0 items-center gap-1" {...at(1)}>
						<span class="icon-[lucide--git-branch] size-3.5 shrink-0"></span>
						<span class="truncate code-dense">{branch}</span>
					</span>
				</div>
			</div>

			{#snippet actions()}
				{#if step >= 7}
					<WorkspaceActions
						{standing}
						actions={offered}
						disabled={!playing}
						pull={upstream.pull}
						compact={narrow.current}
						onopenpull={() => show('pull')}
						onaction={act}
					/>
				{/if}
			{/snippet}
			{#snippet trailing()}
				<span class="icon-[lucide--panel-right-close] hidden size-4 text-muted md:block"></span>
			{/snippet}
		</TitleBar>

		<div class="flex h-152 min-h-0 gap-2 px-2 pb-2 sm:h-136">
			<!-- the main area: the conversation, and what was opened from it -->
			<section class="flex min-w-0 flex-1 flex-col sheet" bind:clientWidth={mainWidth}>
				<PaneTabs
					prefix="{uid}-main"
					tabs={mainTabs}
					{current}
					onselect={(id) => show(id as MainTab)}
					closable={(id) => id !== 'chat'}
					onclose={close}
				>
					{#snippet tab(id: string)}
						{#if id === 'pull' && upstream.pull}<PullRequestTab pull={upstream.pull} />
						{:else if id === 'diff'}
							<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
							<span class="truncate code-dense">{selected?.split('/').at(-1)}</span>
						{:else if id === 'combined'}
							<span class="icon-[lucide--files] size-3.5 shrink-0"></span>
							<span>Combined diff</span>
						{:else}
							<span class="grid size-3.5 shrink-0 place-items-center">
								{#if running}<Spinner label="Claude working" />
								{:else}<AgentAvatar agent="claude" bare />{/if}
							</span>
							<span>Conversation</span>
						{/if}
					{/snippet}
				</PaneTabs>
				{#each mainTabs as id, index (id)}
					<div
						role="tabpanel"
						hidden={id !== current}
						id="{uid}-main-panel-{index}"
						aria-labelledby="{uid}-main-tab-{index}"
						class="flex min-h-0 flex-1 flex-col"
					>
						{#if id === 'chat'}
							<div
								bind:this={transcript}
								class="scroller flex min-h-0 flex-1 flex-col gap-4 px-3 pb-4 sm:px-5"
							>
								{#if step === 0}<p
										class="m-auto max-w-xs text-center text-sm text-balance text-muted"
									>
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
										{#if step === 1 && running}<p
												class="flex h-7 items-center gap-2 text-xs text-muted"
											>
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
												onclick={() => show('pull')}
											>
												<span class="icon-[lucide--git-pull-request] size-3.5"></span>Opened pull
												request #412
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
									{#snippet options()}<span
											class="inline-flex items-center gap-1.5 text-sm text-muted"
											><AgentAvatar agent="claude" bare />Claude</span
										>{/snippet}
								</ReplyComposer>
							</div>
						{:else if id === 'pull' && upstream.pull}
							<PullRequestPane pull={upstream.pull} />
						{:else if id === 'diff' && file}
							{#key file.path}
								<div class="scroller h-full">
									{#if !diffReady}<p
											class="flex items-center gap-2 p-5 text-sm text-muted"
											role="status"
										>
											<ProgressIcon label="Loading the diff" /> Loading the diff…
										</p>{/if}
									<DiffView path={file.path} old={file.old} new={file.new} bind:ready={diffReady} />
								</div>
							{/key}
						{:else if id === 'combined'}
							<div class="scroller space-y-2 p-3">
								{#each changedFiles as file (file.path)}
									<DiffSection path={file.path} added={file.added} removed={file.removed}>
										<DiffView path={file.path} old={file.old} new={file.new} />
									</DiffSection>
								{:else}
									<p class="text-sm text-muted">No changes yet</p>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</section>

			<!-- beside it: what has changed, and below that, what the project runs -->
			<div class="hidden w-64 shrink-0 flex-col gap-2 md:flex xl:w-72">
				<section class="flex min-h-0 flex-1 flex-col sheet-quiet">
					<PaneTabs prefix="{uid}-changes" tabs={['changes']} current="changes">
						{#snippet tab()}
							<span class="icon-[lucide--file-diff] size-3.5 shrink-0"></span>
							<span>Changes</span>
							{#if changedFiles.length}
								<DiffStat
									added={changedFiles.reduce((sum, file) => sum + file.added, 0)}
									removed={changedFiles.reduce((sum, file) => sum + file.removed, 0)}
								/>
							{/if}
						{/snippet}
					</PaneTabs>
					<div
						role="tabpanel"
						id="{uid}-changes-panel-0"
						aria-labelledby="{uid}-changes-tab-0"
						class="flex min-h-0 flex-1 flex-col"
					>
						<ChangesPane {git} onopen={openDiff} onopencombined={() => show('combined')} />
					</div>
				</section>
				<section class="flex min-h-0 flex-1 flex-col sheet-quiet">
					<PaneTabs
						prefix="{uid}-dock"
						tabs={['terminal', 'run']}
						current={dock}
						onselect={(id) => (dock = id as typeof dock)}
					>
						{#snippet tab(id: string)}
							{#if id === 'run'}
								<RunTab {jobs} stateOf={(name) => jobStates[name] ?? 'stopped'} />
							{:else}
								<span class="icon-[lucide--square-terminal] size-3.5 shrink-0"></span>
								<span>Terminal 1</span>
							{/if}
						{/snippet}
					</PaneTabs>
					<div
						role="tabpanel"
						id="{uid}-dock-panel-0"
						aria-labelledby="{uid}-dock-tab-0"
						hidden={dock !== 'terminal'}
						class="min-h-0 flex-1 px-3.5 py-2 code-dense"
					>
						<p>
							<span class="text-accent-ink">return-after-sign-in</span>
							<span class="text-muted">on</span>
							<span class="text-merged">{branch}</span>
						</p>
						<p class="text-ok">❯</p>
					</div>
					<div
						role="tabpanel"
						id="{uid}-dock-panel-1"
						aria-labelledby="{uid}-dock-tab-1"
						hidden={dock !== 'run'}
						class="flex min-h-0 flex-1 flex-col"
					>
						<RunPane
							defaultAction="urls.app"
							{jobs}
							{links}
							stateOf={(name) => jobStates[name] ?? 'stopped'}
							hasTerminal={() => false}
							{start}
							stop={(name) => (jobStates[name] = 'stopped')}
							show={() => {}}
							visit={() => {}}
						/>
					</div>
				</section>
			</div>
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
