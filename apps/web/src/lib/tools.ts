/** Presentation helpers for agent tool calls. */

import type { ToolKind, ToolLocation } from '@geordi/protocol';

/** An icon for a tool, by the names Claude and Codex use. */
export function toolIcon(name: string): string {
	switch (name.toLowerCase()) {
		case 'bash':
		case 'shell':
			return 'icon-[lucide--terminal]';
		case 'read':
			return 'icon-[lucide--file-text]';
		case 'write':
		case 'edit':
		case 'multiedit':
		case 'notebookedit':
			return 'icon-[lucide--file-pen]';
		case 'grep':
		case 'glob':
			return 'icon-[lucide--search]';
		case 'webfetch':
		case 'websearch':
		case 'web_search':
			return 'icon-[lucide--globe]';
		case 'todowrite':
		case 'todo_list':
			return 'icon-[lucide--list-checks]';
		default:
			return 'icon-[lucide--wrench]';
	}
}

/**
 * A one-line summary of a tool's input. Claude passes JSON; we pick the field people care
 * about. Codex passes the command or changed paths as plain text. Paths inside `cwd` (the
 * session's worktree) are shown relative to it.
 */
export function toolSummary(input: string, cwd?: string): string {
	return relativeTo(cwd, pick(input));
}

function pick(input: string): string {
	try {
		const value = JSON.parse(input);
		if (value && typeof value === 'object') {
			for (const key of ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description'])
				if (typeof value[key] === 'string') return value[key];
		}
	} catch {
		// not JSON
	}
	return unwrapShell(input.split('\n')[0]);
}

/** Shows paths inside the session's worktree relative to it. */
export function relativeTo(cwd: string | undefined, text: string): string {
	if (!cwd) return text;
	// the longer root first: `/private/x/` holds `/x/`
	for (const root of roots(cwd).sort((a, b) => b.length - a.length))
		text = text.replaceAll(`${root}/`, '');
	return text;
}

/** Codex wraps commands in `/bin/zsh -lc '…'`; show just the command. */
export function unwrapShell(command: string): string {
	const match = command.match(/^\/bin\/\w+ -lc (['"])([\s\S]*)\1$/);
	return match ? match[2] : command;
}

const KIND_ICONS: Record<ToolKind, string> = {
	read: 'icon-[lucide--file-text]',
	edit: 'icon-[lucide--file-pen]',
	delete: 'icon-[lucide--trash-2]',
	move: 'icon-[lucide--file-symlink]',
	search: 'icon-[lucide--search]',
	execute: 'icon-[lucide--terminal]',
	think: 'icon-[lucide--list-checks]',
	fetch: 'icon-[lucide--globe]',
	switch_mode: 'icon-[lucide--route]',
	other: 'icon-[lucide--wrench]'
};

type Shown = { name: string; toolKind?: ToolKind };

/** An icon for a tool call: by its ACP kind, else (as before there were kinds) its name. */
export function iconOf({ name, toolKind }: Shown): string {
	return toolKind && toolKind !== 'other' ? KIND_ICONS[toolKind] : toolIcon(name);
}

const KIND_NAMES: Record<ToolKind, string> = {
	read: 'Read',
	edit: 'Edit',
	delete: 'Delete',
	move: 'Move',
	search: 'Search',
	execute: 'Run',
	think: 'Plan',
	fetch: 'Fetch',
	switch_mode: 'Switch mode',
	other: 'Tool'
};

/** What sort of tool call it is, in a word, for grouping: calls of one kind look alike. */
export function sortOf({ name, toolKind }: Shown): string {
	return toolKind && toolKind !== 'other' ? KIND_NAMES[toolKind] : name;
}

/** A piece of a tool's title: words, or code (a path, a command), which is set in mono. */
export type TitlePart = { text: string; code: boolean };

/**
 * A tool call's title, as the agent gives it, in parts: what is code in it (in backticks, a
 * file it names, or all of it for a command) set apart from words. Paths inside `cwd` are
 * shown relative to it. Without a title (calls recorded before Geordi kept them), its
 * name and a summary of its input.
 */
export function titleOf(
	tool: Shown & { title?: string; input: string; locations?: ToolLocation[] },
	cwd?: string
): TitlePart[] {
	if (!tool.title) {
		// Claude's input came later than its first update, which was all we kept: `{}`
		const summary = tool.input === '{}' ? '' : toolSummary(tool.input, cwd);
		return [
			{ text: summary ? `${tool.name} ` : tool.name, code: false },
			...(summary ? [{ text: summary, code: true }] : [])
		];
	}
	const title = relativeTo(cwd, tool.title);
	if (tool.toolKind === 'execute') return [{ text: unwrapShell(title), code: true }];
	const paths = (tool.locations ?? [])
		.flatMap(({ path }) => [path, displayPath(path, cwd)])
		.filter((path) => path.length > 1)
		.sort((a, b) => b.length - a.length);
	const parts: TitlePart[] = [];
	title.split('`').forEach((piece, i) => {
		if (i % 2) {
			if (piece) parts.push({ text: piece, code: true });
			return;
		}
		let rest = piece;
		while (rest) {
			const found = paths
				.map((path) => ({ path, at: rest.indexOf(path) }))
				.filter(({ at }) => at >= 0)
				.sort((a, b) => a.at - b.at)[0];
			if (!found) {
				parts.push({ text: rest, code: false });
				break;
			}
			// a path in quotes is shown as code without them
			let before = rest.slice(0, found.at);
			let after = rest.slice(found.at + found.path.length);
			const quote = before.at(-1);
			if ((quote === "'" || quote === '"') && after[0] === quote) {
				before = before.slice(0, -1);
				after = after.slice(1);
			}
			if (before) parts.push({ text: before, code: false });
			parts.push({ text: found.path, code: true });
			rest = after;
		}
	});
	return parts;
}

/**
 * A path as shown: relative to the worktree `cwd`, if it is in it. macOS has temporary
 * directories both as `/var/…` and as `/private/var/…`; agents use either.
 */
export function displayPath(path: string, cwd?: string): string {
	if (!cwd) return path;
	for (const root of roots(cwd)) {
		if (path === root) return '.';
		if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
	}
	return path;
}

/** The files a tool call names that are in the worktree, as paths in it. */
export function filesOf(locations: ToolLocation[] | undefined, cwd?: string) {
	if (!cwd) return [];
	return (locations ?? []).flatMap(({ path, line }) => {
		const file = displayPath(path, cwd);
		return file === path || file === '.' ? [] : [{ path: file, line }];
	});
}

function roots(cwd: string): string[] {
	return cwd.startsWith('/private/') ? [cwd, cwd.slice(8)] : [cwd, `/private${cwd}`];
}
