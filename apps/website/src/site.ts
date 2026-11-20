import web from '../../web/package.json' with { type: 'json' };

/** What the pages say about Geordi in more than one place. */
export const site = {
	title: 'Geordi',
	description:
		'Run Claude Code and Codex in one desktop app. Give each task its own Git worktree and branch.',
	/** What the picture shown with a link to the site shows (`src/og/card.astro`). */
	card: 'Geordi. A calmer way to run coding agents. Download at geordi.run. A workspace sidebar shows task status beside an agent conversation.',
	version: process.env.GEORDI_DOWNLOAD_VERSION ?? web.version,
	repo: 'https://github.com/chattocorp/geordi',
	download: 'https://github.com/chattocorp/geordi/releases/latest',
	docs: {
		selfHosting: 'https://github.com/chattocorp/geordi/blob/main/docs/self-hosting.md',
		configuration: 'https://github.com/chattocorp/geordi/blob/main/docs/configuration.md'
	}
};
