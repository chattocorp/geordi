import { describe, expect, it } from 'vitest';
import { claude } from './claude.ts';
import { codex } from './codex.ts';

const parseAll = (adapter: typeof claude, lines: unknown[]) =>
	lines.flatMap((l) => adapter.parse(l));

describe('claude adapter', () => {
	it('maps stream-json output to session events', () => {
		const events = parseAll(claude, [
			{ type: 'system', subtype: 'hook_started', session_id: 's1' },
			{ type: 'system', subtype: 'init', session_id: 's1' },
			{
				type: 'assistant',
				message: {
					content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.txt' } }]
				}
			},
			{ type: 'rate_limit_event' },
			{
				type: 'user',
				message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: '1\thello' }] }
			},
			{ type: 'assistant', message: { content: [{ type: 'thinking', thinking: '' }] } },
			{ type: 'assistant', message: { content: [{ type: 'text', text: 'It says hello.' }] } },
			{ type: 'result', subtype: 'success', is_error: false, result: 'It says hello.' }
		]);

		expect(events).toEqual([
			{ kind: 'resume', id: 's1' },
			{ kind: 'tool', id: 't1', name: 'Read', input: '{"file_path":"a.txt"}' },
			{ kind: 'tool.result', id: 't1', output: '1\thello', isError: false },
			{ kind: 'text', text: 'It says hello.' },
			{ kind: 'turn.completed' }
		]);
	});

	it('reports failed results', () => {
		expect(claude.parse({ type: 'result', subtype: 'error_max_turns', is_error: true })).toEqual([
			{ kind: 'turn.failed', error: 'error_max_turns' }
		]);
	});

	it('starts with our session ID and resumes with the CLI one', () => {
		const base = { sessionId: 'abc', prompt: 'hi', cwd: '/w', writableRoots: ['/r/.git/objects'] };
		expect(claude.command({ ...base, resumeId: null }).args).toContain('--session-id');
		expect(claude.command({ ...base, resumeId: 'abc' }).args).toContain('--resume');
	});
});

describe('codex adapter', () => {
	it('maps exec --json output to session events', () => {
		const events = parseAll(codex, [
			{ type: 'thread.started', thread_id: 'th1' },
			{
				type: 'item.completed',
				item: { id: 'item_0', type: 'error', message: 'bad hooks config' }
			},
			{ type: 'turn.started' },
			{ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'Reading.' } },
			{
				type: 'item.started',
				item: { id: 'item_2', type: 'command_execution', command: 'cat a.txt', exit_code: null }
			},
			{
				type: 'item.completed',
				item: {
					id: 'item_2',
					type: 'command_execution',
					command: 'cat a.txt',
					aggregated_output: 'hello\n',
					exit_code: 0
				}
			},
			{ type: 'turn.completed', usage: {} }
		]);

		expect(events).toEqual([
			{ kind: 'resume', id: 'th1' },
			{ kind: 'text', text: 'Reading.' },
			{ kind: 'tool', id: 'item_2', name: 'shell', input: 'cat a.txt' },
			{ kind: 'tool.result', id: 'item_2', output: 'hello\n', isError: false },
			{ kind: 'turn.completed' }
		]);
	});

	it('maps failed turns', () => {
		expect(codex.parse({ type: 'turn.failed', error: { message: 'boom' } })).toEqual([
			{ kind: 'turn.failed', error: 'boom' }
		]);
	});
});

describe('prompt handling', () => {
	const base = {
		sessionId: 's',
		prompt: '--dangerously-bypass-approvals-and-sandbox',
		cwd: '/w',
		writableRoots: ['/r/.git/objects']
	};

	it.each([
		['claude', claude],
		['codex', codex]
	])('%s never parses the prompt as a flag', (_, adapter) => {
		for (const resumeId of [null, 'r1']) {
			const { args } = adapter.command({ ...base, resumeId });
			expect(args.at(-1)).toBe(base.prompt);
			expect(args.indexOf('--')).toBeLessThan(args.length - 1);
			expect(args.indexOf('--')).toBeGreaterThan(-1);
		}
	});
});
