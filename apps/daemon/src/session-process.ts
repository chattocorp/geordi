import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const windows = process.platform === 'win32';
const system32 = () => {
	if (!process.env.SystemRoot) throw new Error('SystemRoot is not set');
	return join(process.env.SystemRoot, 'System32');
};

/**
 * Runs a script in Windows PowerShell 5. It is given its own modules only: a `PSModulePath`
 * inherited from PowerShell 7 has it load modules it can't (`Get-Acl`, `ConvertTo-Json`).
 * The scripts use .NET and the language itself, no cmdlets, all the same.
 */
function powershell(script: string, env: Record<string, string> = {}) {
	const shellDirectory = join(system32(), 'WindowsPowerShell', 'v1.0');
	return execFileSync(
		join(shellDirectory, 'powershell.exe'),
		['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference = 'Stop'\n" + script],
		{
			env: { ...process.env, PSModulePath: join(shellDirectory, 'Modules'), ...env },
			encoding: 'utf8',
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		}
	).trim();
}

/**
 * Whether only the user, the system and administrators can change a Windows directory: own
 * it, or be allowed to write in it, delete, or change who may (also as a generic right, and
 * also only for what is made in it). CREATOR OWNER, passed on, reaches only what someone
 * could make already. With `create`, a directory that is not there is made first, with an
 * ACL that only the user is on and that nothing above it adds to: what `0o700` is elsewhere.
 */
function privateWindowsDirectory(dir: string, create = false): boolean {
	const verdict = powershell(
		`$path = $env:GEORDI_ACL_PATH
		$sid = [System.Security.Principal.SecurityIdentifier]
		$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
		if ($env:GEORDI_ACL_CREATE -and -not [System.IO.Directory]::Exists($path)) {
			$security = [System.Security.AccessControl.DirectorySecurity]::new()
			$security.SetAccessRuleProtection($true, $false)
			$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
				$user, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
			[void][System.IO.Directory]::CreateDirectory($path, $security)
		}
		$trusted = @($user.Value, 'S-1-5-18', 'S-1-5-32-544')
		$acl = [System.IO.Directory]::GetAccessControl($path)
		if ($acl.GetOwner($sid).Value -notin $trusted) { return 'unsafe' }
		$rules = $acl.GetAccessRules($true, $true, $sid)
		if (!$rules.Count) { return 'unsafe' }
		# write and append data, attributes, delete (also children), permissions, owner,
		# GENERIC_WRITE, GENERIC_ALL
		$write = 0x116 -bor 0x40 -bor 0x10000 -bor 0x40000 -bor 0x80000 -bor 0x40000000 -bor 0x10000000
		$inheritOnly = [System.Security.AccessControl.PropagationFlags]::InheritOnly
		foreach ($rule in $rules) {
			if ($rule.IdentityReference.Value -eq 'S-1-3-0' -and ($rule.PropagationFlags -band $inheritOnly)) { continue }
			if ($rule.AccessControlType -ne 'Allow' -or $rule.IdentityReference.Value -in $trusted) { continue }
			$rights = [int]$rule.FileSystemRights
			if ($rights -band $write) { return 'unsafe' }
			# ReadData or GENERIC_READ inherited by a file would expose its journal or token.
			if (($rule.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ObjectInherit) -and
				($rights -band (0x1 -bor 0x80000000))) { return 'unsafe' }
		}
		'private'`,
		{ GEORDI_ACL_PATH: dir, GEORDI_ACL_CREATE: create ? '1' : '' }
	);
	return verdict === 'private';
}

/** A session journal names processes and contains credentials. Only its owner may control it. */
export function privateDirectory(dir: string): boolean {
	if (windows) return privateWindowsDirectory(dir);
	const { uid, mode } = statSync(dir);
	return uid === process.getuid!() && !(mode & 0o022);
}

const prepared = new Set<string>();

/**
 * Makes the directory that sessions are kept in, private to the user. One that is there
 * already must be, or nothing in it is trusted: the daemon does not start. Checked once per
 * process.
 */
export function prepareSessionsDirectory(dir: string) {
	if (prepared.has(dir)) return;
	mkdirSync(dirname(dir), { recursive: true });
	if (!windows && !existsSync(dir)) {
		mkdirSync(dir, { mode: 0o700 });
		chmodSync(dir, 0o700); // whatever the umask
	}
	if (!(windows ? privateWindowsDirectory(dir, true) : privateDirectory(dir)))
		throw new Error(`${dir} must belong to you and not be writable by others`);
	prepared.add(dir);
}

/**
 * When processes started, by ID, in one query; a process that is not there is missing. The
 * format is the system's own (`ps`'s `lstart`, ticks on Windows): only ever compared.
 */
export function startTimes(pids: number[]): Map<number, string> {
	const valid = [...new Set(pids)].filter((pid) => Number.isSafeInteger(pid) && pid > 1);
	const times = new Map<number, string>();
	const parse = (output: string) => {
		for (const line of output.split('\n')) {
			const match = /^\s*(\d+)\s+(\S.*?)\s*$/.exec(line);
			if (match) times.set(Number(match[1]), match[2]);
		}
	};
	if (!valid.length) return times;
	if (windows) {
		parse(
			powershell(
				`foreach ($id in @(${valid.join(',')})) {
				try {
					$process = [System.Diagnostics.Process]::GetProcessById($id)
					[string]::Concat($id, ' ', $process.StartTime.ToUniversalTime().Ticks)
				} catch [System.ArgumentException] { continue }
			}`
			)
		);
		return times;
	}
	const ps = (ids: number[]) =>
		spawnSync('ps', ['-o', 'pid=,lstart=', '-p', ids.join(',')], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		});
	const all = ps(valid);
	parse(all.stdout ?? '');
	// `ps` fails for a missing process, or, on macOS, for all of them over one it can't take:
	// those it did not answer for are asked one by one
	if (all.status !== 0 && valid.length > 1)
		for (const pid of valid) if (!times.has(pid)) parse(ps([pid]).stdout ?? '');
	return times;
}

export const startedAt = (pid: number): string | null => startTimes([pid]).get(pid) ?? null;

/**
 * Ends a process and everything it started. On Windows that is always forced (`taskkill /F`,
 * whatever the signal): a console program has no gentler way to be told, so it cannot note
 * how it ended.
 */
export function signalTree(pid: number, signal: NodeJS.Signals) {
	if (windows)
		execFileSync(join(system32(), 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], {
			windowsHide: true,
			stdio: 'ignore'
		});
	else process.kill(-pid, signal);
}

/** Whether `signalTree` gives a process time to end by itself before it is forced. */
export const gentleSignals = !windows;
