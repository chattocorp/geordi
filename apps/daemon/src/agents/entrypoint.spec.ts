import { describe, expect, it } from 'vitest';
import { ENTRYPOINT, setEntrypoint } from './entrypoint.ts';

describe('setEntrypoint', () => {
	it('names Geordi when asked to', () => {
		const env: NodeJS.ProcessEnv = { PATH: '/bin' };
		setEntrypoint(env, true);
		expect(env).toEqual({ PATH: '/bin', CLAUDE_CODE_ENTRYPOINT: ENTRYPOINT });
	});

	it('leaves it to the SDK otherwise', () => {
		const env: NodeJS.ProcessEnv = { PATH: '/bin' };
		setEntrypoint(env, false);
		expect(env).toEqual({ PATH: '/bin' });
	});

	it.each(['cli', 'sdk-ts', 'sdk-cli'])('never passes on an inherited %s', (inherited) => {
		for (const identify of [true, false, undefined]) {
			const env: NodeJS.ProcessEnv = { CLAUDE_CODE_ENTRYPOINT: inherited };
			setEntrypoint(env, identify);
			expect(env.CLAUDE_CODE_ENTRYPOINT).toBe(identify ? ENTRYPOINT : undefined);
		}
	});

	it('is not the name of an Anthropic client', () => {
		expect(['cli', 'claude-vscode', 'claude-desktop', 'mcp']).not.toContain(ENTRYPOINT);
		expect(ENTRYPOINT).not.toMatch(/^(sdk-|claude|remote|local)/);
	});
});
