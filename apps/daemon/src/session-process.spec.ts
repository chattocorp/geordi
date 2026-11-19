import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	privateDirectory,
	prepareSessionsDirectory,
	startedAt,
	startTimes
} from './session-process.ts';

const windows = process.platform === 'win32';

/** Somewhere a test may make directories that are its own (a profile, on Windows). */
const scratch = () => mkdtempSync(join(windows ? homedir() : tmpdir(), 'geordi-private-'));
const icacls = (...args: string[]) =>
	execFileSync(join(process.env.SystemRoot!, 'System32', 'icacls.exe'), args, {
		stdio: 'ignore'
	});
/** Lets everyone change a directory, and what is made in it. */
function share(dir: string) {
	if (windows) icacls(dir, '/grant', '*S-1-1-0:(OI)(CI)M');
	else chmodSync(dir, 0o777);
}

describe('the sessions directory', () => {
	it('is made private, whatever the directory around it allows', () => {
		const around = scratch();
		share(around);
		const dir = join(around, 'sessions');
		prepareSessionsDirectory(dir);
		expect(privateDirectory(dir)).toBe(true);
	});

	it('is not trusted when it was there already and others may change it', () => {
		const dir = join(scratch(), 'sessions');
		mkdirSync(dir);
		share(dir);
		expect(() => prepareSessionsDirectory(dir)).toThrow(/not be writable by others/);
		expect(privateDirectory(dir)).toBe(false);
	});

	// Everyone S-1-1-0, Users S-1-5-32-545, Authenticated Users S-1-5-11, CREATOR OWNER S-1-3-0
	it.runIf(windows).each([
		['everyone may change it', ['/grant', '*S-1-1-0:(OI)(CI)M'], false],
		['users may delete it', ['/grant', '*S-1-5-32-545:(D)'], false],
		['what is made in it is passed modify', ['/grant', '*S-1-5-11:(OI)(CI)(IO)M'], false],
		['it passes on GENERIC_WRITE', ['/grant', '*S-1-5-11:(OI)(CI)(IO)(GW)'], false],
		['users have GENERIC_ALL', ['/grant', '*S-1-5-32-545:(GA)'], false],
		['a direct CREATOR OWNER grant applies to the trusted owner', ['/grant', '*S-1-3-0:F'], true],
		['others may list the directory', ['/grant', '*S-1-5-11:RX'], true],
		['others may read journal files', ['/grant', '*S-1-5-11:(OI)(CI)RX'], false],
		['everyone is denied writing', ['/deny', '*S-1-1-0:(W)'], true],
		['CREATOR OWNER is passed on', ['/grant', '*S-1-3-0:(OI)(CI)(IO)F'], true]
	])('on Windows, is private or not when %s', (_, change, safe) => {
		const dir = join(scratch(), 'sessions');
		prepareSessionsDirectory(dir);
		expect(privateDirectory(dir)).toBe(true);
		icacls(dir, ...change);
		expect(privateDirectory(dir)).toBe(safe);
	});
});

describe('start times', () => {
	it('are asked for all processes at once, and leave out those that are not there', () => {
		const missing = 2 ** 30;
		const times = startTimes([process.pid, process.ppid, missing, 0, -1]);
		expect(times.get(process.pid)).toBeTruthy();
		expect(times.get(process.ppid)).toBeTruthy();
		expect(times.has(missing)).toBe(false);
		expect(startedAt(process.pid)).toBe(times.get(process.pid));
		expect(startedAt(missing)).toBeNull();
	});
});
