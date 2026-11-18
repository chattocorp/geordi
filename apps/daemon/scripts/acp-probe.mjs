// Run with pnpm --filter @geordi/daemon acp:probe <codex|claude> [inspect|steer|background].
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { client, methods, ndJsonStream } from '@agentclientprotocol/sdk';

const [, , provider, scenario = 'inspect'] = process.argv;
const commands = new Map([
	['codex', 'codex-acp'],
	['claude', 'claude-agent-acp']
]);
assert(
	commands.has(provider) && ['inspect', 'steer', 'background'].includes(scenario),
	'Usage: acp:probe <codex|claude> [inspect|steer|background]'
);
const directory = await mkdtemp(join(tmpdir(), 'geordi-acp-'));
const command = './probe-task';
const token = randomUUID();
await writeFile(
	join(directory, 'probe-task'),
	`#!/bin/sh
set -eu
touch started
sleep 20
touch finished
echo ${token}
`,
	{ mode: 0o700 }
);
const child = spawn(commands.get(provider), [], {
	cwd: directory,
	stdio: ['pipe', 'pipe', 'inherit']
});
const exited = new Promise((resolve) => {
	child.once('error', resolve);
	child.once('exit', (code, signal) => resolve(new Error(`Adapter exited (${signal ?? code})`)));
});
const marker = randomUUID();
const started = Promise.withResolvers();
const watching = setInterval(() => {
	if (existsSync(join(directory, 'started'))) {
		clearInterval(watching);
		console.log('Shell task started');
		started.resolve();
	}
}, 100);
const awakened = Promise.withResolvers();
let afterTurn = false;
let reply = '';
const connection = client({ name: 'geordi-probe' })
	.onNotification(methods.client.session.update, ({ params: { update } }) => {
		if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
			reply += update.content.text;
			if (afterTurn && reply.includes(token)) awakened.resolve();
		}
	})
	.onRequest(methods.client.session.requestPermission, ({ params }) => {
		const option =
			params.toolCall.rawInput?.command === command &&
			params.options.find((option) => option.kind === 'allow_once');
		return {
			outcome: option
				? { outcome: 'selected', optionId: option.optionId }
				: { outcome: 'cancelled' }
		};
	})
	.connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));

async function probe() {
	const { agent } = connection;
	const info = await agent.request(methods.agent.initialize, {
		protocolVersion: 1,
		clientCapabilities: {}
	});
	const steering = info._meta?.steering?.supported === true;
	console.log({ agent: info.agentInfo, protocol: info.protocolVersion, steering });
	if (scenario === 'inspect') return;
	const { sessionId } = await agent.request(methods.agent.session.new, {
		cwd: directory,
		mcpServers: []
	});
	if (provider === 'codex') {
		await agent.request(methods.agent.session.setMode, { sessionId, modeId: 'workspace-write' });
	}
	console.log('Session opened');
	const send = (text) =>
		agent.request(methods.agent.session.prompt, { sessionId, prompt: [{ type: 'text', text }] });
	if (scenario === 'background') {
		const result = await send(
			`Run exactly this shell command as a background task: ${command}. Reply WAITING immediately. End this turn. Do not poll or wait. When the task wakes you, reply with its output without further input.`
		);
		assert.equal(result.stopReason, 'end_turn');
		assert.match(reply, /WAITING/);
		assert(
			!existsSync(join(directory, 'finished')) && !reply.includes(token),
			'Completion arrived before the foreground turn ended'
		);
		console.log('Foreground turn ended; waiting for background result');
		afterTurn = true;
		reply = '';
		await awakened.promise;
		assert(existsSync(join(directory, 'finished')));
	} else {
		assert(steering, 'Wrapper does not advertise steering');
		const turn = send(
			`Run exactly this foreground shell command: \`${command}\`. Include its output in your final reply.`
		);
		await Promise.race([
			started.promise,
			turn.then(() => {
				throw new Error('Turn ended before a running tool was observed');
			})
		]);
		assert(!existsSync(join(directory, 'finished')), 'Tool finished before steering');
		const result = await agent.request('_session/steering', {
			sessionId,
			prompt: [
				{
					type: 'text',
					text: `Also include ${marker} in the final reply. Let the running command finish and include both its output and this marker verbatim.`
				}
			],
			_meta: { steering: { idleBehavior: 'promptRequired' } }
		});
		console.log('Steering outcome:', result.outcome);
		assert.equal(result.outcome, 'injected');
		assert.equal((await turn).stopReason, 'end_turn');
		assert(
			existsSync(join(directory, 'finished')),
			'Shell task had not finished when the steered turn ended'
		);
		assert(reply.includes(token), 'Missing tool output in assistant message');
		assert(reply.includes(marker), 'Missing steering message in assistant reply');
	}
	console.log(`${provider} ${scenario} passed`);
}

let timer;
try {
	await Promise.race([
		probe(),
		exited.then((error) => {
			throw error;
		}),
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`Timed out during ${scenario}`)), 120_000);
		})
	]);
} finally {
	clearInterval(watching);
	clearTimeout(timer);
	connection.close();
	child.kill();
	const kill = setTimeout(() => child.kill('SIGKILL'), 3000);
	await exited;
	clearTimeout(kill);
	await rm(directory, { recursive: true, force: true });
}
