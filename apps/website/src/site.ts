import web from '../../web/package.json' with { type: 'json' };

/** What the pages say about Geordi in more than one place. */
export const site = {
	title: 'Geordi',
	description:
		'Geordi is a desktop app for working with Claude Code and Codex. Every task gets its own agent, worktree and branch, and you can follow all of them from one window.',
	version: web.version,
	repo: 'https://github.com/chattocorp/geordi',
	download: 'https://github.com/chattocorp/geordi/releases/latest',
	docs: {
		selfHosting: 'https://github.com/chattocorp/geordi/blob/main/docs/self-hosting.md',
		configuration: 'https://github.com/chattocorp/geordi/blob/main/docs/configuration.md'
	}
};
