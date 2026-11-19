import { describe, expect, it } from 'vitest';
import { displayPath, filesOf, iconOf, sortOf, titleOf, toolIcon, toolSummary } from './tools.ts';

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

describe('titleOf', () => {
	const code = (text: string) => ({ text, code: true });
	const words = (text: string) => ({ text, code: false });

	it('shows a call without a title by its name and input, as before', () => {
		expect(titleOf({ name: 'Read', input: '{"file_path":"/w/a.ts"}' }, '/w')).toEqual([
			words('Read '),
			code('a.ts')
		]);
		expect(titleOf({ name: 'Bash', input: '{}' })).toEqual([words('Bash')]);
	});

	it('sets the files a title names in mono, relative to the worktree', () => {
		const tool = {
			name: 'Read',
			input: '{}',
			title: 'Read /w/notes.txt (1 - 5)',
			locations: [{ path: '/w/notes.txt', line: 1 }]
		};
		expect(titleOf(tool, '/w')).toEqual([words('Read '), code('notes.txt'), words(' (1 - 5)')]);
	});

	it('drops the quotes round a path', () => {
		const tool = {
			name: 'exec_command',
			input: '{}',
			toolKind: 'read' as const,
			title: "Read file '/w/a.md'",
			locations: [{ path: '/w/a.md' }]
		};
		expect(titleOf(tool, '/w')).toEqual([words('Read file '), code('a.md')]);
	});

	it('sets code in backticks, and all of a command, in mono', () => {
		expect(titleOf({ name: 'Glob', input: '{}', title: 'Find `src` `*.ts`' })).toEqual([
			words('Find '),
			code('src'),
			words(' '),
			code('*.ts')
		]);
		expect(
			titleOf({ name: 'Bash', input: '{}', toolKind: 'execute', title: 'git status' })
		).toEqual([code('git status')]);
	});
});

describe('paths', () => {
	it('shows paths in the worktree relative to it', () => {
		expect(displayPath('/w/a.ts', '/w')).toBe('a.ts');
		expect(displayPath('/elsewhere/a.ts', '/w')).toBe('/elsewhere/a.ts');
	});

	it('names only files in the worktree', () => {
		expect(
			filesOf([{ path: '/w/a.ts', line: 3 }, { path: '/w' }, { path: '/tmp/b' }], '/w')
		).toEqual([{ path: 'a.ts', line: 3 }]);
	});

	it('names each file once, where it is first named', () => {
		expect(
			filesOf(
				[
					{ path: '/w/a.ts', line: 1 },
					{ path: '/w/a.ts', line: 163 }
				],
				'/w'
			)
		).toEqual([{ path: 'a.ts', line: 1 }]);
	});
});

describe('iconOf', () => {
	it('prefers the kind, and the name where the kind says nothing', () => {
		expect(iconOf({ name: 'exec_command', toolKind: 'read' })).toBe('icon-[lucide--file-text]');
		expect(iconOf({ name: 'Bash', toolKind: 'other' })).toBe('icon-[lucide--terminal]');
		expect(sortOf({ name: 'Bash', toolKind: 'execute' })).toBe('Run');
		expect(sortOf({ name: 'Bash' })).toBe('Bash');
	});
});
