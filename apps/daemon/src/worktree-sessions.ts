type InDirectory = { options: { cwd: string }; working(): boolean };

/** A workspace ID identifies a conversation. Several conversations can run in one directory. */
export function worktreeSessions<S extends InDirectory>(
	sessions: ReadonlyMap<string, S>,
	beginning: ReadonlyMap<string, { cwd: string }>
) {
	const sessionsIn = (cwd: string) => [...sessions.values()].filter((s) => s.options.cwd === cwd);
	const workingIn = (cwd: string) =>
		[...beginning.values()].some((turn) => turn.cwd === cwd) ||
		sessionsIn(cwd).some((session) => session.working());
	return { sessionsIn, workingIn };
}
