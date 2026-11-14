import { describe, expect, it } from 'vitest';
import { EventStore, type GeordiEvent } from './events';
import { createIssues } from './issues';

describe('issues', () => {
	it('opens, closes and reopens issues', () => {
		const store = new EventStore<GeordiEvent>(':memory:');
		const issues = createIssues(store);

		const n = issues.open({ title: 'First', body: '' }, 'hendrik');
		issues.open({ title: 'Second', body: '' });
		expect(issues.list().map((i) => i.number)).toEqual([2, 1]);
		expect(issues.get(n)).toMatchObject({ title: 'First', state: 'open', openedBy: 'hendrik' });

		issues.close(n);
		expect(issues.get(n).state).toBe('closed');
		issues.reopen(n);
		expect(issues.get(n).state).toBe('open');
	});

	it('does not append events for no-op state changes', () => {
		const store = new EventStore<GeordiEvent>(':memory:');
		const issues = createIssues(store);
		const n = issues.open({ title: 'First', body: '' });

		issues.reopen(n);
		expect(store.readAll()).toHaveLength(1);
	});

	it('rebuilds state from the log', () => {
		const store = new EventStore<GeordiEvent>(':memory:');
		const n = createIssues(store).open({ title: 'First', body: '' });
		createIssues(store).close(n);

		expect(createIssues(store).get(n).state).toBe('closed');
	});

	it('returns copies, not projection state', () => {
		const issues = createIssues(new EventStore<GeordiEvent>(':memory:'));
		const n = issues.open({ title: 'First', body: '' });

		issues.get(n).title = 'Mutated';
		expect(issues.get(n).title).toBe('First');
	});

	it('throws 404 for unknown issues', () => {
		const issues = createIssues(new EventStore<GeordiEvent>(':memory:'));
		expect(() => issues.get(42)).toThrow();
	});
});
