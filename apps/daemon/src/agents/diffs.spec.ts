import { expect, it } from 'vitest';
import type { ToolCallUpdate } from '@agentclientprotocol/sdk/experimental/v2/unstable';
import { MAX_PATCH, ToolDiffs, toolDiff } from './diffs.ts';

const path = '/work/notes.txt';
const patch = `diff --git ${path} ${path}\n--- ${path}\n+++ ${path}\n@@ -1 +1 @@\n-one\n+two`;
const edit = (content: unknown[], status?: string) =>
	({ toolCallId: 't', content, ...(status && { status }) }) as unknown as ToolCallUpdate;
const diff = (p: string, text = patch, operation = 'modify') => ({
	type: 'diff',
	changes: [{ operation, path: p, fileType: 'text' }],
	patch: { format: 'git_patch', text }
});

it('reads the diff an agent sends with an edit, as observed from both wrappers', () => {
	expect(toolDiff(edit([diff(path)]))).toEqual({
		files: [{ operation: 'modify', path, fileType: 'text' }],
		patch: patch + '\n'
	});
	expect(toolDiff(edit([{ type: 'content', content: { type: 'text', text: 'ok' } }]))).toBe(
		undefined
	);
	expect(toolDiff(edit([]))).toBe(undefined);
});

it('joins one entry per file, and keeps moves and patchless changes', () => {
	const moved = {
		type: 'diff',
		changes: [{ operation: 'move', oldPath: '/work/a', path: '/work/b' }]
	};
	expect(toolDiff(edit([diff(path), moved, diff('/work/x', patch, 'add')]))).toEqual({
		files: [
			{ operation: 'modify', path, fileType: 'text' },
			{ operation: 'move', oldPath: '/work/a', path: '/work/b' },
			{ operation: 'add', path: '/work/x', fileType: 'text' }
		],
		patch: patch + '\n' + patch + '\n'
	});
});

it('says a patch is too large instead of keeping it', () => {
	expect(toolDiff(edit([diff(path, patch + '\n+x'.repeat(MAX_PATCH))]))).toEqual({
		files: [{ operation: 'modify', path, fileType: 'text' }],
		tooLarge: true
	});
});

it('keeps a diff from an earlier update for a call that completes, not one that fails', () => {
	const diffs = new ToolDiffs();
	diffs.receive(edit([diff(path)], 'in_progress'));
	diffs.receive(edit([{ type: 'content', content: { type: 'text', text: 'done' } }], 'completed'));
	expect(diffs.take(edit([], 'completed'))?.patch).toBe(patch + '\n');
	expect(diffs.take(edit([], 'completed'))).toBe(undefined);
	diffs.receive(edit([diff(path)]));
	expect(diffs.take(edit([], 'failed'))).toBe(undefined);
});
