#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { forgeReady, services } from '@geordi/launch/services.js';
import { daemonDataPaths, options } from './options.js';

/**
 * Geordi without the desktop app: the forge and the daemon, started as the app starts them
 * (ADR-008), in this terminal. Ctrl+C stops Geordi and its agents, as it stops a daemon;
 * any other way of going away leaves the agents working for the next start (ADR-007).
 */

const here = import.meta.dirname;
const { version } = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const usage = `Geordi ${version}: a self-hostable code forge and agent orchestrator.

Usage: geordi

Starts Geordi on http://localhost:7717, with its data in ~/.geordi. Settings come from the
environment: https://github.com/chattocorp/geordi/blob/main/docs/self-hosting.md`;

const [arg] = process.argv.slice(2);
if (arg === '--version' || arg === '-v') exit(version);
if (arg === '--help' || arg === '-h') exit(usage);
if (arg) exit(`Unknown argument: ${arg}\n\n${usage}`, 1);
if (Number(process.versions.node.split('.')[0]) < 24)
	exit(`Geordi needs Node.js 24 or newer; this is ${process.version}.`, 1);

let settings;
try {
	settings = options(process.env);
} catch (error) {
	exit(error.message, 1);
}
const service = services(settings);
let stopping = false;

/** Starts a service, its output in this terminal, each line marked with its name. */
function start(/** @type {'forge' | 'daemon'} */ name) {
	const { entry, env } = service[name];
	const child = spawn(process.execPath, [join(here, entry)], {
		env: { ...process.env, ...(name === 'daemon' && daemonDataPaths(process.env)), ...env },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	for (const [from, to] of [
		[child.stdout, process.stdout],
		[child.stderr, process.stderr]
	]) {
		let rest = '';
		from.setEncoding('utf8');
		from.on('data', (data) => {
			const lines = (rest + data).split('\n');
			rest = lines.pop();
			for (const line of lines) to.write(`${name.padEnd(6)} │ ${line}\n`);
		});
	}
	return child;
}

const forge = start('forge');
forge.on('exit', (code) => {
	if (stopping) return;
	console.error(
		`The forge exited with code ${code}. Is another Geordi running, on port ${settings.web} or with the same data?`
	);
	process.exitCode = 1;
	stop('SIGTERM'); // the agents work on
});

let daemon = null;
function startDaemon() {
	const child = (daemon = start('daemon'));
	child.on('exit', (code) => {
		if (stopping) return;
		// it fell over: its agents are still working, and want following again
		console.error(`The daemon exited with code ${code}; starting it again.`);
		setTimeout(startDaemon, 1000);
	});
}

// Ctrl+C reaches the services too; a signal sent to this process alone is passed on.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
	process.on(signal, () => stop(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM'));

await forgeReady(settings.web);
if (!stopping) {
	startDaemon();
	console.log(`\nGeordi is running on ${settings.origin}\n`);
}

/**
 * Stops both services with `signal` (SIGINT stops the agents too, SIGTERM leaves them
 * working), and then this process. A second Ctrl+C kills them.
 */
async function stop(signal) {
	if (stopping) {
		// a second Ctrl+C: don't wait any longer
		if (signal === 'SIGINT') for (const child of [forge, daemon]) child?.kill('SIGKILL');
		return;
	}
	stopping = true;
	const running = [forge, daemon].filter(
		(child) => child && child.exitCode === null && child.signalCode === null
	);
	const gone = running.map((child) => new Promise((resolve) => child.once('exit', resolve)));
	for (const child of running) child.kill(signal);
	await Promise.all(gone);
	process.exit();
}

function exit(message, code = 0) {
	(code ? console.error : console.log)(message);
	process.exit(code);
}
