/**
 * What Geordi calls itself to Claude Code, when the person chose so in Settings: the CLI
 * records it as the session's `entrypoint`. Our own name, never one of Anthropic's clients
 * (`cli`, `claude-vscode`, `claude-desktop`).
 */
export const ENTRYPOINT = 'geordi';

/**
 * Says in `env` which client starts Claude Code (`CLAUDE_CODE_ENTRYPOINT`): Geordi, or,
 * not `identify`ing, nobody, so that the Agent SDK puts in its own (`sdk-ts`). Experimental:
 * Anthropic does not document the variable. What we inherited (from a Claude session the
 * daemon was started in, say) is never passed on: it would speak for another client.
 */
export function setEntrypoint(env: NodeJS.ProcessEnv, identify: boolean | undefined) {
	delete env.CLAUDE_CODE_ENTRYPOINT;
	if (identify) env.CLAUDE_CODE_ENTRYPOINT = ENTRYPOINT;
}
