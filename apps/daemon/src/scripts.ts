import type { Script } from '@geordi/protocol';

/** How much of a failed setup's output its agent is shown. */
const TAIL = 3000;

/** Terminal output as text: without its escape sequences and carriage returns. */
/* eslint-disable no-control-regex -- escape sequences are what this is about */
const plain = (output: string) =>
	output
		.replace(/\x1b\]7717;[\s\S]*$/, '') // our end marker, and what we said after it
		.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '') // OSC: titles
		.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '') // CSI: colours, cursor movement
		.replace(/\x1b./g, '')
		.replace(/\r(?!\n)/g, '\n')
		.replace(/\r/g, '')
		.replace(/\n{3,}/g, '\n\n');
/* eslint-enable no-control-regex */

/**
 * How a new worktree's setup script went (FDR-006), as its agent is told with its first
 * turn: `null` if there is nothing to tell, because it went well (or there is none).
 */
export function setupNote(
	setup: Script | null,
	/** How it went; or why it did not run: nobody agreed to it, or the directory is agents' work. */
	ran: { status: number | null; output: string } | 'unagreed' | 'agents'
): string | null {
	if (!setup || (typeof ran === 'object' && ran.status === 0)) return null;
	const note = (text: string) => `(A note from Geordi, not from the person: ${text})`;
	const script = `this workspace's setup script (\`${setup.command}\`, from the repository's Geordi configuration)`;
	const yourself = `What it would do (installing dependencies, say) is not done; do what you need of it yourself.`;
	if (ran === 'unagreed')
		return note(`${script} did not run, as the person has not agreed to it yet. ${yourself}`);
	if (ran === 'agents')
		return note(
			`${script} did not run: Geordi runs it by itself only in a directory made fresh from the main line, and this one holds an agent's work. ${yourself}`
		);
	if (ran.status === null)
		return note(`${script} was stopped before it finished. What it does may be done only in part.`);
	const tail = plain(ran.output).trim().slice(-TAIL);
	return note(
		`${script} failed, with status ${ran.status}, when the workspace's directory was made.${tail ? ` Its output ended with:\n\n\`\`\`\n${tail}\n\`\`\`\n` : ''}`
	);
}
