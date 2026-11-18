import { expect, it } from 'vitest';
import { worktreeSessions } from './worktree-sessions.ts';

it('guards a shared directory until the last agent there is idle', () => {
	let aideWorking = true;
	const owner = { options: { cwd: '/shared' }, working: () => false };
	const aide = { options: { cwd: '/shared' }, working: () => aideWorking };
	const other = { options: { cwd: '/other' }, working: () => true };
	const sessions = new Map([
		['owner', owner],
		['aide', aide],
		['other', other]
	]);
	const { sessionsIn, workingIn } = worktreeSessions(sessions, new Map());

	expect(sessionsIn('/shared')).toEqual([owner, aide]);
	expect(workingIn('/shared')).toBe(true);
	aideWorking = false;
	expect(workingIn('/shared')).toBe(false);
});

it('guards the directory while an aide is starting, before it has a session', () => {
	const beginning = new Map([['aide', { cwd: '/shared' }]]);
	const { workingIn } = worktreeSessions(new Map(), beginning);

	expect(workingIn('/shared')).toBe(true);
	expect(workingIn('/other')).toBe(false);
	beginning.delete('aide');
	expect(workingIn('/shared')).toBe(false);
});
