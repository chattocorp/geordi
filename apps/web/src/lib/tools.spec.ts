import { describe, expect, it } from 'vitest';
import { toolIcon, toolSummary } from './tools.ts';

describe('toolSummary', () => {
	it('picks the meaningful field from JSON input, relative to the worktree', () => {
		expect(toolSummary('{"file_path":"/w/src/a.ts","content":"…"}', '/w')).toBe('src/a.ts');
		expect(toolSummary('{"command":"git status","description":"Show status"}')).toBe('git status');
	});

	it('unwraps codex shell commands', () => {
		expect(toolSummary("/bin/zsh -lc 'git add CODEX.md'")).toBe('git add CODEX.md');
		expect(toolSummary('/bin/zsh -lc "git commit -m \'x\'"')).toBe("git commit -m 'x'");
	});

	it('falls back to the first line of plain input', () => {
		expect(toolSummary('add /w/CODEX.md\nmodify /w/b.md', '/w')).toBe('add CODEX.md');
	});
});

describe('toolIcon', () => {
	it('maps known tools and falls back to a wrench', () => {
		expect(toolIcon('Bash')).toBe('icon-[lucide--terminal]');
		expect(toolIcon('mystery')).toBe('icon-[lucide--wrench]');
	});
});
