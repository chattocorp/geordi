<script lang="ts">
	import type { FileDiffMetadata } from '@pierre/diffs';
	import type { Attachment } from 'svelte/attachments';

	type Props = {
		/** The file's path; its extension picks the syntax highlighting. */
		path: string;
		/** The file before and after, `null` where it doesn't exist. */
		old?: string | null;
		new?: string | null;
		/**
		 * Instead of both versions, a file's part of a parsed patch: its changes
		 * with a few lines around them, which is all there is to see.
		 */
		patch?: FileDiffMetadata;
		/** Whether the diff is on screen yet: the viewer is loaded on first use, which takes a moment. */
		ready?: boolean;
	};
	let { path, old = null, new: current = null, patch, ready = $bindable(false) }: Props = $props();

	// The diff is rendered afresh (losing any expanded context) when these change, so they
	// must only change when the text really does, not whenever the data is fetched again.
	const before = $derived(old);
	const after = $derived(current);

	const isDark = () => document.documentElement.classList.contains('dark');

	/**
	 * Renders the diff with Pierre's diff viewer (https://diffs.com). It gets both whole
	 * files, so the unchanged lines between changes start collapsed and can be expanded a
	 * few at a time, without ever leaving the diff.
	 */
	const diff: Attachment<HTMLElement> = (node) => {
		// Read here so that a change to the file renders the diff afresh.
		const name = path;
		const [was, is, parsed] = [before, after, patch];
		if (was === null && is === null && !parsed) return;

		ready = false;
		let dispose = () => {};
		let disposed = false;

		// The viewer needs a browser (it renders into a shadow root), so it is loaded here.
		import('@pierre/diffs').then(({ FileDiff, parseDiffFromFile }) => {
			if (disposed) return;

			const view = new FileDiff({
				// the same themes as code in agent output (see markdown.ts)
				theme: { light: 'github-light', dark: 'github-dark-dimmed' },
				themeType: isDark() ? 'dark' : 'light',
				diffStyle: 'unified',
				// the window's tab already names the file
				disableFileHeader: true,
				expansionLineCount: 20,
				// our tokens instead of the themes' own backgrounds
				unsafeCSS: `:host { --diffs-bg: var(--bg) !important; }`
			});
			const fileDiff =
				parsed ??
				parseDiffFromFile(
					was === null ? null : { name, contents: was },
					is === null ? null : { name, contents: is }
				);
			view.render({ fileDiff, containerWrapper: node });
			ready = true;

			const themed = new MutationObserver(() => view.setThemeType(isDark() ? 'dark' : 'light'));
			themed.observe(document.documentElement, { attributeFilter: ['class'] });

			dispose = () => {
				themed.disconnect();
				view.cleanUp();
			};
		});

		return () => {
			disposed = true;
			dispose();
		};
	};
</script>

<div class="diff-view" {@attach diff}></div>

<style>
	/* The viewer lives in a shadow root; these custom properties are its styling API. */
	.diff-view {
		--diffs-font-family: var(--font-mono);
		--diffs-font-features: 'liga' 0, 'calt' 0;
		--diffs-font-size: var(--text-xs);
		--diffs-line-height: 1.55;
		--diffs-addition-color-override: var(--ok);
		--diffs-deletion-color-override: var(--danger);
	}
</style>
