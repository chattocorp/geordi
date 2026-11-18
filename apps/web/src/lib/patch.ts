import type { FileDiffMetadata, ParsedPatch } from '@pierre/diffs';
import type { ToolDiff } from '@geordi/protocol';
import { displayPath } from './tools.ts';

/** One file a tool call changed, as shown: its diff if the patch has one that can be drawn. */
export type PatchFile = {
	/** Relative to the worktree, where it is inside it. */
	path: string;
	oldPath?: string;
	operation: string;
	binary: boolean;
	diff?: FileDiffMetadata;
};

/**
 * The files of an agent's diff, each with its part of the patch. ACP's git patches have
 * absolute paths without Git's `a/` and `b/`, which the parser (`parsePatchFiles` from
 * `@pierre/diffs`, passed in since it is loaded on first use) expects; only the `diff --git`
 * lines are given them, as nothing in a hunk can look like one. The patch is the agent's
 * text: whatever it holds, this never throws; a file the patch says nothing usable about
 * is listed without a diff.
 */
export function patchFiles(
	{ files, patch }: ToolDiff,
	cwd: string | undefined,
	parse: (patch: string) => ParsedPatch[]
): PatchFile[] {
	let parsed: FileDiffMetadata[] = [];
	if (patch) {
		try {
			parsed = parse(patch.replace(/^diff --git (\/\S*) (\/\S*)$/gm, 'diff --git a/$1 b/$2'))
				.flatMap((p) => p.files)
				.filter((file) => file.hunks.length > 0);
		} catch {
			parsed = [];
		}
	}
	const shown = files.map((file): PatchFile => {
		const index = parsed.findIndex((d) => d.name === file.path);
		const [diff] = index < 0 ? [] : parsed.splice(index, 1);
		return {
			path: displayPath(file.path, cwd),
			...(file.oldPath &&
				file.oldPath !== file.path && { oldPath: displayPath(file.oldPath, cwd) }),
			operation: file.operation,
			binary: !!file.fileType && file.fileType !== 'text',
			...(diff && { diff: { ...diff, name: displayPath(diff.name, cwd) } })
		};
	});
	// A patch for a file `files` doesn't name (it should, but it is the agent's word) is shown too.
	for (const diff of parsed)
		shown.push({
			path: displayPath(diff.name, cwd),
			operation: 'modify',
			binary: false,
			diff: { ...diff, name: displayPath(diff.name, cwd) }
		});
	return shown;
}

/** What happened to a file whose change can't be drawn, in words. */
export function describeChange({ operation, path, oldPath, binary }: PatchFile): string {
	const what = binary ? ' (not a text file)' : '';
	switch (operation) {
		case 'add':
			return `Added ${path}${what}`;
		case 'delete':
			return `Deleted ${path}${what}`;
		case 'move':
			return `Moved ${oldPath ?? '?'} to ${path}${what}`;
		case 'copy':
			return `Copied ${oldPath ?? '?'} to ${path}${what}`;
		default:
			return `Changed ${path}${what}`;
	}
}
