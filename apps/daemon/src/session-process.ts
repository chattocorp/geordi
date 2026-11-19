import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const windows = process.platform === 'win32';
const system32 = () => join(process.env.SystemRoot!, 'System32');

function powershell(script: string, env = process.env) {
	return execFileSync(
		join(system32(), 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
		['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference = 'Stop'\n" + script],
		{ env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
	).trim();
}

/** A session journal names processes and contains credentials. Only its owner may control it. */
export function privateDirectory(dir: string): boolean {
	if (!windows) {
		const { uid, mode } = statSync(dir);
		return uid === process.getuid!() && !(mode & 0o022);
	}
	const result = powershell(
		`$sid = [System.Security.Principal.SecurityIdentifier]
		$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
		$trusted = @($user, 'S-1-5-18', 'S-1-5-32-544')
		$acl = Get-Acl -LiteralPath $env:GEORDI_ACL_PATH
		if ($acl.GetOwner($sid).Value -notin $trusted) { return 'unsafe' }
		$rules = $acl.GetAccessRules($true, $true, $sid)
		if (!$rules.Count) { return 'unsafe' }
		$write = [System.Security.AccessControl.FileSystemRights]'Write,Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership'
		foreach ($rule in $rules) {
			# Inherited CREATOR OWNER grants rights to the owner of a new child.
			if ($rule.IdentityReference.Value -eq 'S-1-3-0' -and
				($rule.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly)) { continue }
			if ($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band $write) -and
				$rule.IdentityReference.Value -notin $trusted) { return 'unsafe' }
		}
		'private'`,
		{ ...process.env, GEORDI_ACL_PATH: dir }
	);
	return result === 'private';
}

export function startedAt(pid: number): string | null {
	if (!Number.isSafeInteger(pid) || pid <= 1) return null;
	try {
		if (windows) return powershell(`(Get-Process -Id ${pid}).StartTime.ToUniversalTime().Ticks`);
		return (
			execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore']
			}).trim() || null
		);
	} catch {
		return null;
	}
}

export function signalTree(pid: number, signal: NodeJS.Signals) {
	if (windows)
		execFileSync(join(system32(), 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], {
			windowsHide: true,
			stdio: 'ignore'
		});
	else process.kill(-pid, signal);
}
