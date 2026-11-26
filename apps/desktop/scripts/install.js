import { execFileSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const command = (file, args, env = process.env) =>
	execFileSync(file, args, { stdio: 'inherit', env });

/**
 * What the app is opened with: what the Finder would give it (the app reads the rest from a
 * login shell). `open` hands the app its caller's environment, and the caller is often an
 * agent's shell, inside Geordi: with its `ELECTRON_RUN_AS_NODE`, the new app would start as
 * Node and end at once, and its workspace's variables would reach every agent.
 */
export function launchEnv(env) {
	const kept = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'PATH'];
	return Object.fromEntries(kept.filter((name) => env[name]).map((name) => [name, env[name]]));
}

/** Prepare the replacement before quitting. Keep the old bundle until replacement succeeds. */
export async function installApp(
	packaged,
	installed,
	run = command,
	pause = (ms) => new Promise((r) => setTimeout(r, ms))
) {
	const temporary = mkdtempSync(join(dirname(installed), '.geordi-install-'));
	const replacement = join(temporary, 'Geordi.app');
	const backup = join(temporary, 'previous.app');
	// A workspace install runs below Geordi in the process tree. macOS pgrep skips
	// its ancestors unless asked to include them, even for a detached installer.
	const executable = join(installed, 'Contents/MacOS/Geordi');
	const pattern = executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const running = () => {
		try {
			run('pgrep', ['-af', `^${pattern}([[:space:]]|$)`]);
			return true;
		} catch (error) {
			if (error.status === 1) return false;
			throw error;
		}
	};
	let backedUp = false;
	let completed = false;
	try {
		run('ditto', [packaged, replacement]);
		run('codesign', ['--force', '--deep', '--sign', '-', replacement]);
		if (running()) {
			run('osascript', ['-e', 'tell application id "com.github.chattocorp.geordi" to quit']);
			for (let n = 0; n < 50 && running(); n++) await pause(200);
			if (running()) throw new Error('Geordi did not quit. The installed app was not replaced.');
		}
		try {
			renameSync(installed, backup);
			backedUp = true;
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
		try {
			renameSync(replacement, installed);
		} catch (error) {
			if (backedUp) {
				renameSync(backup, installed);
				backedUp = false;
			}
			throw error;
		}
		run('open', [installed], launchEnv(process.env));
		completed = true;
		console.log(`installed ${installed}`);
	} finally {
		if (!backedUp || completed) rmSync(temporary, { recursive: true, force: true });
		else console.error(`Previous app retained at ${backup}`);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await installApp(process.argv[2], '/Applications/Geordi.app');
}
