import web from '../../web/package.json' with { type: 'json' };

/** What the pages say about Geordi in more than one place. */
export const site = {
	title: 'Geordi',
	description:
		'Geordi is a desktop app for Claude Code and Codex. Each task gets its own agent, worktree and branch, and you can keep an eye on all of them from one window.',
	/** What the picture shown with a link to the site shows (`src/og/card.astro`). */
	card: 'Geordi: a calmer way to run coding agents. Beside it, a Geordi workspace: the sidebar with every workspace and how its work stands, and the conversation with an agent.',
	version: process.env.GEORDI_DOWNLOAD_VERSION ?? web.version,
	repo: 'https://github.com/chattocorp/geordi',
	download: 'https://github.com/chattocorp/geordi/releases/latest',
	docs: {
		selfHosting: 'https://github.com/chattocorp/geordi/blob/main/docs/self-hosting.md',
		configuration: 'https://github.com/chattocorp/geordi/blob/main/docs/configuration.md'
	}
};
