import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { resumeSessions, startSession } from '../src/session.ts';

const [, , agent, scenario = 'inspect', permissionMode = 'full-access'] = process.argv;
const prompts = {
	subagents:
		'Use two native subagents in parallel. Ask the first to run pwd and reply DAEMON_READY and the second to run pwd and reply UI_READY. Wait for both, then summarize.',
	inspect: 'Reply with exactly READY.',
	commands: 'Reply with exactly READY.',
	ask: 'Use your native blocking question tool to ask exactly one question: which token should you return? Offer Alpha and Beta. Wait for the answer, then reply with only the chosen token, exactly once.',
	steer:
		'Run ./probe-task as a foreground shell command. Wait for it to finish and include its output in your final reply.',
	background:
		'Run ./probe-task as a background task. Reply WAITING immediately and end this turn. Do not poll. When the task wakes you, reply with its output without further input.'
};
assert(
	(['codex', 'claude'].includes(agent) || (agent === 'opencode' && scenario === 'inspect')) &&
		Object.hasOwn(prompts, scenario) &&
		['auto', 'full-access'].includes(permissionMode),
	'Usage: acp:probe <codex|claude|opencode> [inspect|steer|background|ask|subagents|commands] [auto|full-access]'
);

const root = mkdtempSync(join(tmpdir(), 'geordi-acp-'));
const cwd = join(root, 'workspace');
const sessions = join(root, 'sessions');
const workspaceId = randomUUID();
const dir = join(sessions, workspaceId);
const token = randomUUID();
const commandOutput = randomUUID();
const events = [];
const cursors = [];
let session;
let interrupted = false;
const interrupt = () => (interrupted = true);
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

function receive(event, cursor) {
	events.push(event);
	cursors.push(cursor);
	console.log(event.kind);
}
const ofKind = (kind) => events.filter((event) => event.kind === kind);
const reply = (records) =>
	records
		.filter((event) => event.kind === 'text')
		.map((event) => event.text)
		.join('\n');
const finished = () => existsSync(join(cwd, 'finished'));
const deadline = Date.now() + 120_000;
async function until(description, condition) {
	for (;;) {
		if (interrupted) throw new Error('Probe interrupted');
		const failure = ofKind('turn.failed')[0];
		if (failure) throw new Error(failure.error);
		if (condition()) return;
		assert(!session.over(), 'Host exited while waiting for ' + description);
		assert(Date.now() < deadline, 'Timed out waiting for ' + description);
		await sleep(50);
	}
}

function reconnect() {
	const before = session.resumeId();
	assert(before, 'Missing provider session ID');
	session.detach();
	session = resumeSessions(sessions, () => receive).get(workspaceId);
	assert(session, 'Could not recover detached session');
	assert.equal(session.resumeId(), before);
	console.log('Reconnected to the same session');
}

async function beforeTurnEnds(description, condition) {
	await until(description, () => {
		assert.equal(ofKind('turn.completed').length, 0, 'Turn ended before ' + description);
		return condition();
	});
}

try {
	mkdirSync(cwd);
	mkdirSync(sessions, { mode: 0o700 });
	if (scenario === 'steer' || scenario === 'background') {
		writeFileSync(
			join(cwd, 'probe-task'),
			`#!/bin/sh\nset -eu\ntouch started\nsleep 20\ntouch finished\necho ${commandOutput}\n`,
			{ mode: 0o700 }
		);
	}
	if (scenario === 'commands') {
		// A skill of the workspace's own, which both agents list among their commands.
		const skill = join(cwd, agent === 'codex' ? '.agents' : '.claude', 'skills', 'geordi-probe');
		mkdirSync(skill, { recursive: true });
		writeFileSync(
			join(skill, 'SKILL.md'),
			'---\nname: geordi-probe\ndescription: Answers a Geordi probe.\n---\n\nReply with exactly PROBED followed by the argument you were given, and nothing else.\n'
		);
		execFileSync('git', ['init', '-q'], { cwd });
	}
	session = startSession(
		{
			agent,
			options: {
				cwd,
				dir,
				sessionId: workspaceId,
				resumeId: null,
				// the smallest model will do, where it can be chosen
				settings: {
					permissionMode,
					...(scenario === 'commands' &&
						(agent === 'claude'
							? { model: 'haiku' }
							: { model: process.env.PROBE_CODEX_MODEL, effort: 'low' }))
				},
				writableRoots: [],
				api: null
			}
		},
		{ prompt: prompts[scenario] },
		receive,
		dir
	);
	if (scenario === 'subagents') {
		await beforeTurnEnds('first subagent', () => ofKind('subagent').length);
		reconnect();
	}
	if (scenario === 'ask') {
		await beforeTurnEnds('the question', () => ofKind('question').length);
		const [question] = ofKind('question');
		// Codex exposes the custom answer as a separate note beside the choice.
		let answers = [token];
		if (question.questions.length !== 1) {
			const [choice, note] = question.questions;
			assert.equal(question.questions.length, 2);
			assert(choice.options.some((option) => option.label === 'None of the above'));
			assert(note.optional && note.options.length === 0);
			answers = ['None of the above', token];
		}
		reconnect();
		assert(session.working(), 'Recovered session lost the open turn');
		session.answer(question.id, answers);
		// Retry the same question ID, as after a lost receipt.
		session.answer(question.id, answers);
	}
	if (scenario === 'steer') {
		await beforeTurnEnds('the running command', () => existsSync(join(cwd, 'started')));
		reconnect();
		assert(!finished(), 'Command finished before steering');
		session.say({
			prompt: `Also include ${token} in your final reply, alongside the command output.`
		});
	}

	await until('foreground completion', () => ofKind('turn.completed').length);
	if (scenario === 'commands') {
		await until('the commands', () => ofKind('commands').length);
		const offered = ofKind('commands').at(-1).commands;
		console.log(`${offered.length} commands:`, offered.map((c) => c.name).join(' '));
		const skill = offered.find((c) => c.name.replace(/^\$/, '') === 'geordi-probe');
		assert(skill, 'The workspace skill is not among the commands');
		// as Geordi sends it: the message begins with the command
		session.say({ prompt: `/${skill.name} ${token}` });
		await until('the skill', () => ofKind('turn.completed').length >= 2);
		const start = events.indexOf(ofKind('turn.started')[1]);
		assert.match(
			reply(events.slice(start)),
			new RegExp('PROBED\\s+' + token),
			'The skill did not run'
		);
		// one the wrapper answers itself, without the model: its turn has to end all the same
		const local = agent === 'codex' ? 'status' : 'context';
		assert(
			offered.some((c) => c.name === local),
			`/${local} is not among the commands`
		);
		session.say({ prompt: `/${local}` });
		await until(`/${local}`, () => ofKind('turn.completed').length >= 3);
		const third = events.indexOf(ofKind('turn.started')[2]);
		assert(reply(events.slice(third)).trim(), `/${local} said nothing`);
		console.log(reply(events.slice(third)).slice(0, 300));
	}
	if (scenario === 'steer') assert(finished(), 'Steered turn ended before command completion');
	if (scenario === 'background') {
		assert(!finished(), 'Command finished before foreground completion');
		assert.match(reply(events), /WAITING/);
		reconnect();
		await until('background completion', () => ofKind('turn.completed').length >= 2);
	}
	if (scenario === 'subagents') {
		// A provider may end its foreground turn before the reviewers report back.
		await until('both reviewer reports', () => {
			const done = ofKind('subagent').filter((e) => e.update.state === 'done');
			return new Set(done.map((e) => e.path[0])).size === 2;
		});
	}
	session.close();
	await until('host shutdown', () => session.over());
	const turns = events.filter((event) => event.kind.startsWith('turn.')).map((event) => event.kind);
	const pair = ['turn.started', 'turn.completed'];
	if (scenario !== 'subagents')
		assert.deepEqual(
			turns,
			scenario === 'background'
				? [...pair, ...pair]
				: scenario === 'commands'
					? [...pair, ...pair, ...pair]
					: pair
		);
	assert.equal(new Set(cursors).size, events.length, 'Host event delivered twice');
	assert.equal(ofKind('resume').length, 1);
	const completion = events.indexOf(ofKind('turn.completed')[0]);
	const foreground = events.slice(0, completion);
	switch (scenario) {
		case 'subagents': {
			const children = Map.groupBy(ofKind('subagent'), (event) => event.path[0]);
			assert.equal(children.size, 2);
			const reports = [];
			for (const updates of children.values()) {
				assert(updates.some((e) => e.update.state === 'done'));
				// Claude sends an incoming assignment on the child session.
				if (agent === 'claude') assert(updates.some((e) => e.update.incoming && e.update.text));
				assert(updates.some((e) => e.update.kind === 'tool'));
				reports.push(
					updates
						.filter((e) => e.update.kind === 'message' && !e.update.incoming)
						.map((e) => e.update.text)
						.join(' ')
				);
			}
			assert(reports.some((text) => text.includes('DAEMON_READY')));
			assert(reports.some((text) => text.includes('UI_READY')));
			break;
		}
		case 'inspect': {
			assert.match(reply(foreground), /READY/);
			if (agent === 'opencode') {
				console.log(`OpenCode ACP v1 session ${session.resumeId()}`);
				break;
			}
			const wrapper = agent === 'codex' ? 'codex-acp' : 'claude-agent-acp';
			const { version } = createRequire(import.meta.url)(
				`@agentclientprotocol/${wrapper}/package.json`
			);
			console.log(`${wrapper} ${version}, ACP v2 session ${session.resumeId()}`);
			break;
		}
		case 'ask': {
			assert.equal(ofKind('question').length, 1);
			const afterQuestion = foreground.slice(foreground.indexOf(ofKind('question')[0]) + 1);
			assert.equal(
				reply(afterQuestion).split(token).length - 1,
				1,
				'Expected one answer in the original turn'
			);
			break;
		}
		case 'steer':
			assert(reply(foreground).includes(commandOutput), 'Missing command output');
			assert(reply(foreground).includes(token), 'Missing steering message');
			break;
		case 'background': {
			assert(finished());
			assert(!reply(foreground).includes(commandOutput));
			const start = events.indexOf(ofKind('turn.started')[1]);
			const end = events.indexOf(ofKind('turn.completed')[1]);
			assert(reply(events.slice(start, end)).includes(commandOutput), 'Missing background output');
			break;
		}
	}
	console.log(`${agent} ${scenario} passed`);
} finally {
	if (session && !session.over()) {
		session.kill();
		await session.done;
	}
	rmSync(root, { recursive: true, force: true });
	process.off('SIGINT', interrupt);
	process.off('SIGTERM', interrupt);
}
