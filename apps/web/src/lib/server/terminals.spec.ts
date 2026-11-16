import type { DaemonResults, ForgeMessage } from '@geordi/protocol';
import { describe, expect, it } from 'vitest';
import { createTerminals } from './terminals.ts';

const at = { workspaceId: 'w', terminal: 't' };
const size = { cols: 100, rows: 30 };
/** Lets pending scrollback requests settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve));

function setup({ connected = true } = {}) {
	const sent: ForgeMessage[] = [];
	/** What the daemon would answer when asked for a terminal's scrollback. */
	const daemon: { scrollback: DaemonResults['scrollback'] } = { scrollback: null };
	const terminals = createTerminals(
		(message) => (sent.push(message), connected),
		async () => daemon.scrollback,
		(worktreeId) => ({ worktreeId, repoPath: '/repo' })
	);
	const watch = (terminal = at) => {
		const seen: [string, boolean][] = [];
		const detach = terminals.attach(terminal, (...args) => seen.push(args));
		return { seen, detach, text: () => seen.map(([data]) => data).join('') };
	};
	return { terminals, sent, daemon, watch, types: () => sent.map((message) => message.type) };
}

describe('terminals', () => {
	it('never starts a shell just because someone is watching', async () => {
		const { terminals, sent, watch } = setup();
		const { text } = watch();
		terminals.resize(at, size);
		await settled();

		expect(sent).toEqual([]);
		expect(text()).toContain('not running');
	});

	it('starts on request and relays output and input', async () => {
		const { terminals, sent, watch } = setup();
		terminals.start(at, size);
		expect(sent).toEqual([
			{ type: 'terminal.open', terminalId: 'w:t', worktreeId: 'w', repoPath: '/repo', ...size }
		]);

		const { seen, detach } = watch();
		await settled();
		seen.length = 0;

		terminals.output('w:t', 'hello', 0);
		terminals.input(at, 'ls\r');
		expect(seen).toEqual([['hello', false]]);
		expect(sent.at(-1)).toEqual({ type: 'terminal.input', terminalId: 'w:t', data: 'ls\r' });

		detach();
		terminals.output('w:t', ' world', 5);
		expect(seen).toHaveLength(1);
	});

	it('shows a terminal the daemon started by itself, and starts it again as it was', () => {
		const { terminals, sent } = setup();
		const setupAt = { workspaceId: 'w', terminal: 'run-setup' };
		const run = { job: 'setup', command: 'pnpm install' };
		terminals.opened('w:run-setup', run);
		expect(terminals.running('w')).toEqual(['run-setup']);
		expect(sent).toEqual([]); // it is running already

		// it ended; a key press runs that same script again (if it is still what was agreed to)
		terminals.exit('w:run-setup');
		terminals.input(setupAt, '\r');
		expect(sent).toEqual([
			{
				type: 'terminal.open',
				terminalId: 'w:run-setup',
				worktreeId: 'w',
				repoPath: '/repo',
				cols: 80,
				rows: 24,
				run
			}
		]);
	});

	it('keeps the terminals of a workspace apart', async () => {
		const { terminals, daemon, watch } = setup();
		daemon.scrollback = { data: '', end: 0 };
		const { seen } = watch();
		await settled();
		terminals.output('w:other', 'elsewhere', 0);
		expect(seen).toEqual([]);
	});

	it("catches a new viewer up from the daemon's scrollback, without gaps or repeats", async () => {
		const { terminals, daemon, watch } = setup();
		daemon.scrollback = { data: 'onetwo', end: 6 };
		const { seen } = watch();

		// arrives while the scrollback is on its way: one piece it contains, one it doesn't
		terminals.output('w:t', 'two', 3);
		terminals.output('w:t', 'three', 6);
		await settled();
		terminals.output('w:t', 'four', 11);

		expect(seen).toEqual([
			['onetwo', true],
			['three', false],
			['four', false]
		]);
	});

	it('knows a job that has ended from one that runs, and starts it again on request', () => {
		const { terminals, types } = setup();
		const job = { workspaceId: 'w', terminal: 'run-play' };
		const run = { job: 'play', command: './play' };
		terminals.start(job, size, run);
		expect(terminals.isRunning(job)).toBe(true);
		expect(terminals.finished('w')).toEqual({});

		// its command is over; its terminal is still there to be read
		terminals.ended('w:run-play', 3);
		expect(terminals.running('w')).toEqual(['run-play']);
		expect(terminals.finished('w')).toEqual({ 'run-play': 3 });
		expect(terminals.isRunning(job)).toBe(false);

		// started again, it is asked of the daemon anew, and runs
		terminals.start(job, size, run);
		expect(types()).toEqual(['terminal.open', 'terminal.open']);
		expect(terminals.finished('w')).toEqual({});
		expect(terminals.isRunning(job)).toBe(true);

		// a daemon that reconnects says which have ended
		terminals.reconcile(['w:run-play'], { 'w:run-play': 0 });
		expect(terminals.finished('w')).toEqual({ 'run-play': 0 });
		terminals.exit('w:run-play');
		expect(terminals.finished('w')).toEqual({});
	});

	it('picks running terminals up again after a restart', async () => {
		const { terminals, daemon, sent, watch } = setup();
		// a fresh forge: it has never heard of this terminal, but the daemon is running it
		terminals.reconcile(['w:t']);
		daemon.scrollback = { data: 'before the restart', end: 18 };
		const { text } = watch();
		await settled();

		expect(text()).toBe('before the restart');
		terminals.input(at, 'x');
		expect(sent).toEqual([{ type: 'terminal.input', terminalId: 'w:t', data: 'x' }]);
	});

	it('notices shells that ended while the daemon was away', async () => {
		const { terminals, watch, types } = setup();
		terminals.start(at, size);
		const { text } = watch();
		await settled();

		terminals.reconcile([]);
		expect(text()).toContain('The shell exited');
		terminals.input(at, 'x');
		expect(types()).toEqual(['terminal.open', 'terminal.open']);
	});

	it('restarts an exited shell on the next key press, at its last size', () => {
		const { terminals, sent, types } = setup();
		terminals.start(at, size);
		terminals.exit('w:t');
		terminals.resize(at, { cols: 50, rows: 10 });
		terminals.input(at, 'x');
		expect(types()).toEqual(['terminal.open', 'terminal.open']);
		expect(sent.at(-1)).toMatchObject({ cols: 50, rows: 10 });
	});

	it('knows which terminals of a workspace are running, and says when that changes', () => {
		const { terminals } = setup();
		let changes = 0;
		terminals.subscribe(() => changes++);

		terminals.start(at, size);
		terminals.start({ workspaceId: 'w', terminal: 'second' }, size);
		terminals.start({ workspaceId: 'other', terminal: 't' }, size);
		expect(terminals.running('w')).toEqual(['t', 'second']);
		expect(changes).toBe(3);

		terminals.exit('w:t');
		expect(terminals.running('w')).toEqual(['second']);
		terminals.close({ workspaceId: 'w', terminal: 'second' });
		expect(terminals.running('w')).toEqual([]);
		expect(changes).toBe(5);

		// a fresh forge learns of running shells from the daemon
		terminals.reconcile(['w:t']);
		expect(terminals.running('w')).toEqual(['t']);
	});

	it('ends the shell when the terminal is closed', () => {
		const { terminals, sent } = setup();
		terminals.start(at, size);
		terminals.close(at);
		expect(sent.at(-1)).toEqual({ type: 'terminal.close', terminalId: 'w:t' });
	});

	it('says so when no daemon is connected', async () => {
		const { terminals, watch } = setup({ connected: false });
		const { text } = watch();
		await settled();
		terminals.start(at, size);
		expect(text()).toContain('No daemon connected');
	});
});
