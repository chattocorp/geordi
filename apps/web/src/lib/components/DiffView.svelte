<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	type Props = {
		/** The file's path; its extension picks the syntax highlighting. */
		path: string;
		/** The file before and after, `null` where it doesn't exist. */
		old: string | null;
		new: string | null;
	};
	let { path, old, new: current }: Props = $props();

	const isDark = () => document.documentElement.classList.contains('dark');

	/**
	 * Renders the diff with Pierre's diff viewer (https://diffs.com). It gets both whole
	 * files, so the unchanged lines between changes start collapsed and can be expanded a
	 * few at a time, without ever leaving the diff.
	 */
	const diff: Attachment<HTMLElement> = (node) => {
		// Read here so that a change to the file renders the diff afresh.
		const name = path;
		const before = old;
		const after = current;
		if (before === null && after === null) return;

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
			const fileDiff = parseDiffFromFile(
				before === null ? null : { name, contents: before },
				after === null ? null : { name, contents: after }
			);
			view.render({ fileDiff, containerWrapper: node });

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
		--diffs-font-size: var(--text-xs);
		--diffs-line-height: 1.55;
		--diffs-addition-color-override: var(--ok);
		--diffs-deletion-color-override: var(--danger);
	}
</style>
