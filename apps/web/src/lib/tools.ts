/** Presentation helpers for agent tool calls. */

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
function relativeTo(cwd: string | undefined, text: string): string {
	return cwd ? text.replaceAll(`${cwd}/`, '') : text;
}

/** Codex wraps commands in `/bin/zsh -lc '…'`; show just the command. */
export function unwrapShell(command: string): string {
	const match = command.match(/^\/bin\/\w+ -lc (['"])([\s\S]*)\1$/);
	return match ? match[2] : command;
}
