<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Badge from '@geordi/ui/Badge.svelte';
	import Button from '@geordi/ui/Button.svelte';
	import WorkspaceRow from '@geordi/ui/WorkspaceRow.svelte';
	import Notice from './Notice.svelte';

	/**
	 * Whole screens, mocked from the design system's tokens, utilities and components: where
	 * to see that they still go together after one of them changes. Nothing here works.
	 */
	const { Story } = defineMeta({ title: 'Foundations/Screens' });

	const standing = {
		ready: { label: 'Ready to merge', tone: 'ok', icon: 'icon-[lucide--circle-check]' },
		failing: { label: 'Checks failing', tone: 'danger', icon: 'icon-[lucide--circle-x]' },
		merged: { label: 'Merged', tone: 'merged', icon: 'icon-[lucide--git-merge]' }
	} as const;
	const action = (id: 'merge-pull' | 'fix-checks' | 'archive', label: string, icon: string) => [
		{ id, label, icon, say: '' }
	];
	const noop = () => {};
</script>

<Story name="Workspace" asChild>
	<div class="flex h-160 max-w-6xl gap-2 rounded-card bg-frame p-2">
		<!-- the sidebar: rows at rest, current, pointed at, put aside, and with something to do -->
		<aside class="flex w-64 shrink-0 flex-col sheet-quiet">
			<nav class="space-y-px p-2">
				<a href="#top" class="item gap-2.5 px-2.5 py-1.5 text-base">
					<span class="icon-[lucide--plus] size-4 shrink-0"></span> New workspace
				</a>
				<a href="#top" class="item gap-2.5 px-2.5 py-1.5 text-base">
					<span class="icon-[lucide--archive] size-4 shrink-0"></span> Archive
				</a>
				<a href="#top" class="item gap-2.5 px-2.5 py-1.5 text-base">
					<span class="icon-[lucide--settings] size-4 shrink-0"></span> Settings
					<kbd class="ml-auto font-sans text-xs text-muted">⌘,</kbd>
				</a>
			</nav>
			<p class="px-4 pt-2 pb-1 label">geordi</p>
			<div class="space-y-px px-2">
				<WorkspaceRow title="Consolidate the design system" href="#a" current working />
				<WorkspaceRow title="Theme the scroll bars" href="#b" highlighted />
				<WorkspaceRow title="Choose a release name" href="#c" asking unread />
				<WorkspaceRow
					title="Open palettes with Cmd+K"
					href="#d"
					standing={standing.ready}
					actions={action('merge-pull', 'Merge PR', 'icon-[lucide--git-merge]')}
					onaction={noop}
				/>
				<WorkspaceRow
					title="Show a window at once"
					href="#e"
					standing={standing.failing}
					actions={action('fix-checks', 'Fix errors', 'icon-[lucide--wrench]')}
					onaction={noop}
				/>
				<WorkspaceRow
					title="Bring a workspace back"
					href="#f"
					standing={standing.merged}
					actions={action('archive', 'Archive', 'icon-[lucide--archive]')}
					onaction={noop}
				/>
				<WorkspaceRow title="Try a denser sidebar" href="#g" inactive />
				<WorkspaceRow title="Scratchpad" href="#h" locked />
			</div>
		</aside>

		<!-- what is read: tabs, a ribbon in each tone, the conversation, the reply box -->
		<main class="flex min-w-0 flex-1 flex-col sheet">
			<div class="pane-bar gap-1 px-2">
				<span class="item h-7 tab-active px-2">
					<span class="icon-[lucide--message-circle] size-3.5"></span> Conversation
				</span>
				<span class="item h-7 px-2 tab-inactive">
					<span class="icon-[lucide--file-diff] size-3.5"></span> layout.css
				</span>
				<span class="item h-7 px-2 tab-inactive">
					<span class="icon-[lucide--terminal] size-3.5"></span> Storybook
				</span>
				<div class="ml-auto tools">
					<Button variant="ghost" size="sm" icon="icon-[lucide--columns-2]" label="Split" />
					<Button variant="ghost" size="sm" icon="icon-[lucide--x]" label="Close" />
				</div>
			</div>
			<div class="scroller space-y-5 px-6 py-4">
				<div class="flex flex-wrap items-center gap-2">
					{#each [['tone-ok', 'icon-[lucide--circle-check]', 'Ready to merge'], ['tone-danger', 'icon-[lucide--circle-x]', 'Checks failing'], ['tone-merged', 'icon-[lucide--git-merge]', 'Merged'], ['tone-accent', 'icon-[lucide--message-circle-question]', 'Waiting for your answer'], ['bg-sunken text-muted', 'icon-[lucide--file-diff]', '3 files changed']] as [tone, icon, label] (label)}
						<span
							class={[
								tone,
								'inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium'
							]}
						>
							<span class={[icon, 'size-4']}></span>
							{label}
						</span>
					{/each}
				</div>
				<div class="ml-auto message bg-bubble">
					Opportunities to straighten out our design system?
				</div>
				<div class="prose max-w-none">
					<p>
						The foundations hold. The drift is in the layer between tokens and components: rows you
						can pick, soft tints and raised surfaces, such as <code>item</code> and
						<a href="#top">tones</a>.
					</p>
				</div>
				<div class="card">
					<div class="item px-3.5 py-2 text-ink">
						<span class="icon-[lucide--terminal] size-4 text-muted"></span>
						<span class="code">pnpm test</span>
						<span class="ml-auto rounded-control tone-danger px-1.5 text-xs font-semibold">
							failed
						</span>
					</div>
				</div>
				<Notice>claude exited with code 1: not logged in</Notice>
				<div class="flex flex-wrap items-center gap-2">
					<Badge>neutral</Badge>
					<Badge dot>idle</Badge>
					<Badge tone="accent" dot>working</Badge>
					<span class="text-sm text-muted">muted text</span>
					<span class="text-sm text-faint">faint text</span>
				</div>
			</div>
			<div class="px-5 pb-4">
				<div class="card-float p-2">
					<p class="px-3 py-2 text-faint">Reply…</p>
					<div class="flex items-center justify-end gap-2 px-1">
						<Button variant="ghost" size="sm" icon="icon-[lucide--paperclip]" label="Attach" />
						<Button variant="primary" size="sm" icon="icon-[lucide--arrow-up]">Send</Button>
					</div>
				</div>
			</div>
		</main>

		<!-- beside it: a list of rows, one pointed at -->
		<div class="flex w-64 shrink-0 flex-col gap-2">
			<aside class="flex-1 sheet-quiet p-2">
				<span class="item inline-flex h-7 tab-active px-2">Changes</span>
				<p class="mt-2 item px-2 py-1 text-ink">layout.css</p>
			</aside>
			<aside class="flex-1 sheet-quiet">
				<div class="pane-bar px-2">
					<span class="item h-7 tab-active px-2">Run</span>
				</div>
				<div class="space-y-px px-2">
					{#each [['icon-[lucide--play]', 'Web server', ''], ['icon-[lucide--play]', 'Agent daemon', 'bg-hover'], ['icon-[lucide--link]', 'Geordi', ''], ['icon-[lucide--play]', 'Storybook', '']] as [icon, label, state] (label)}
						<div class={['item h-8 gap-1 pr-1 pl-0.5 text-ink', state]}>
							<span class="grid size-6 shrink-0 place-items-center text-muted">
								<span class={[icon, 'size-3.5']}></span>
							</span>
							{label}
						</div>
					{/each}
				</div>
			</aside>
		</div>
	</div>
</Story>

<Story name="Page with a menu" asChild>
	<div class="flex max-w-4xl gap-2 rounded-card bg-frame p-2">
		<nav class="w-52 shrink-0 space-y-0.5 sheet-quiet p-2">
			<a href="#top" class="item item-active px-2.5 py-1.5 font-medium">
				<span class="icon-[lucide--folder-git-2] size-4 shrink-0"></span> Repositories
			</a>
			<a href="#top" class="item px-2.5 py-1.5">
				<span class="icon-[lucide--bot] size-4 shrink-0"></span> Agents
			</a>
			<a href="#top" class="item px-2.5 py-1.5">
				<span class="icon-[lucide--palette] size-4 shrink-0"></span> Appearance
			</a>
		</nav>
		<main class="min-w-0 flex-1 sheet">
			<div class="space-y-6 p-8">
				<h1 class="title">Repositories</h1>
				<div class="space-y-2">
					<p class="label">Add a repository</p>
					<div class="flex gap-2">
						<input class="min-w-0 flex-1 input" placeholder="~/src/project" aria-label="Path" />
						<Button variant="primary">Add</Button>
					</div>
				</div>
				<div class="space-y-2">
					<p class="label">Which agent answers</p>
					<div class="flex items-start gap-4">
						<!-- a control whose popup is open, and the popup: the row in hand is picked -->
						<span class="item inline-flex h-8 gap-1.5 item-picked px-2">
							Claude Code <span class="icon-[lucide--chevron-down] size-3.5"></span>
						</span>
						<div class="w-64 card-float p-1">
							<p class="menu-item">Codex</p>
							<p class="menu-item item-picked">
								Claude Code <span class="ml-auto icon-[lucide--check] size-3.5"></span>
							</p>
							<p class="menu-item">OpenCode</p>
						</div>
					</div>
				</div>
				<ul class="card p-2">
					<li class="item w-full gap-3 px-3 py-2">
						<span class="icon-[lucide--folder-git-2] size-4 text-faint"></span>
						<span class="text-ink">geordi</span>
						<span class="ml-auto code-dense">~/src/geordi</span>
					</li>
					<li class="item w-full gap-3 bg-hover px-3 py-2 text-ink">
						<span class="icon-[lucide--folder-git-2] size-4 text-faint"></span>
						<span class="text-ink">chatto</span>
						<span class="ml-auto code-dense">~/src/chatto</span>
					</li>
				</ul>
				<div class="empty">No other repositories yet.</div>
			</div>
		</main>
	</div>
</Story>
