import type { AgentEvent, DaemonMessage } from '@geordi/protocol';

type WorkspaceEvent = Extract<DaemonMessage, { type: 'workspace.event' }>;

/** Keep each host record until the forge acknowledges its durable append. */
export function eventDelivery(
	send: (message: WorkspaceEvent) => void,
	sendLive: (message: WorkspaceEvent) => void
) {
	const deliveries = new Map<string, { cursor: string; sent: number; acknowledged: boolean }>();
	const emitFor = (workspaceId: string) => (event: AgentEvent, cursor?: string) => {
		if (!cursor) {
			send({ type: 'workspace.event', workspaceId, event });
			return true;
		}
		const pending = deliveries.get(workspaceId);
		if (pending?.cursor === cursor) {
			if (pending.acknowledged) {
				deliveries.delete(workspaceId);
				return true;
			}
			if (Date.now() - pending.sent < 1000) return false;
		}
		deliveries.set(workspaceId, { cursor, sent: Date.now(), acknowledged: false });
		sendLive({ type: 'workspace.event', workspaceId, event, cursor });
		return false;
	};
	function acknowledge(workspaceId: string, cursor: string, read: (() => void) | undefined) {
		const pending = deliveries.get(workspaceId);
		if (pending?.cursor !== cursor) return;
		pending.acknowledged = true;
		read?.();
	}
	return { emitFor, acknowledge };
}
