import type { AgentLive } from '@geordi/protocol';
import type { HostEvent, LiveEvent } from './host.ts';

/** Whether a host event is live data: that goes its own way, unrecorded. */
export const isLive = (event: HostEvent): event is LiveEvent =>
	event.kind === 'background' ||
	event.kind === 'usage' ||
	event.kind === 'session.model' ||
	event.kind === 'commands' ||
	event.kind === 'limits' ||
	event.kind === 'suggestion';

/** What a live event says, as the part of the session's live state that it changes. */
export function liveOf(event: LiveEvent): AgentLive {
	switch (event.kind) {
		case 'background':
			return { background: event.tasks };
		case 'session.model':
			return { sessionModel: event.value };
		case 'usage':
			return { usage: event.usage };
		case 'commands':
			return { commands: event.commands };
		case 'limits':
			return { limits: event.limits, limitsAt: event.at };
		case 'suggestion':
			return { suggestion: event.text };
	}
}
