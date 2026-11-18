import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { eventDelivery } from './event-delivery.ts';
import { resumeSessions } from './session.ts';

function backlog(count: number, send: Parameters<typeof eventDelivery>[1]) {
	const root = mkdtempSync(join(tmpdir(), 'geordi-delivery-'));
	const dir = join(root, 'w');
	mkdirSync(dir);
	const events = Array.from({ length: count }, (_, i) => ({ kind: 'text', text: String(i) }));
	const lines = events.map((event) => JSON.stringify(event) + '\n');
	writeFileSync(
		join(dir, 'meta.json'),
		JSON.stringify({ generation: 'g', options: { resumeId: null } })
	);
	writeFileSync(join(dir, 'host.json'), '{"pid":0}');
	writeFileSync(join(dir, 'out.jsonl'), lines.join(''));
	const { emitFor, acknowledge } = eventDelivery(vi.fn(), send);
	const session = resumeSessions(root, emitFor).get('w')!;
	return {
		events,
		lines,
		dir,
		session,
		ack: (cursor: string) => acknowledge('w', cursor, session.read),
		clean: () => {
			session.detach();
			rmSync(root, { recursive: true, force: true });
		}
	};
}

it('delivers a burst in order at the acknowledgment rate', async () => {
	const received: unknown[] = [];
	const batch = backlog(30, ({ event, cursor }) => {
		received.push(event);
		setImmediate(() => batch.ack(cursor!));
	});
	try {
		const start = performance.now();
		await batch.session.done;
		const elapsed = performance.now() - start;
		expect(received).toEqual(batch.events);
		expect(elapsed).toBeLessThan(1000);
	} finally {
		batch.clean();
	}
});

it('keeps the offset at the last receipt and retries the pending record after a second', () => {
	vi.useFakeTimers();
	const send = vi.fn();
	const batch = backlog(3, send);
	try {
		vi.advanceTimersByTime(100);
		const first = send.mock.calls[0][0];
		batch.ack('stale');
		vi.advanceTimersByTime(999);
		expect(send.mock.calls).toEqual([[first]]);
		expect(existsSync(join(batch.dir, 'offset'))).toBe(false);
		vi.advanceTimersByTime(1);
		expect(send.mock.calls).toEqual([[first], [first]]);
		batch.ack(first.cursor);
		vi.advanceTimersByTime(100);
		batch.ack(first.cursor);
		expect(send).toHaveBeenCalledTimes(3);
		expect(send.mock.calls[2][0].event).toEqual(batch.events[1]);
		expect(readFileSync(join(batch.dir, 'offset'), 'utf8')).toBe(
			String(Buffer.byteLength(batch.lines[0]))
		);
	} finally {
		batch.clean();
		vi.useRealTimers();
	}
});
