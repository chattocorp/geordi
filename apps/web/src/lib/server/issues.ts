import { error } from '@sveltejs/kit';
import type { EventStore, GeordiEvent } from './events/index.ts';

type IssueStream = `issue:${number}`;

export type IssueEvent =
	| {
			type: 'issue.opened';
			stream: IssueStream;
			data: { number: number; title: string; body: string };
	  }
	| { type: 'issue.closed'; stream: IssueStream; data: { number: number } }
	| { type: 'issue.reopened'; stream: IssueStream; data: { number: number } };

export type Issue = {
	number: number;
	title: string;
	body: string;
	state: 'open' | 'closed';
	openedAt: string;
	openedBy: string | null;
	updatedAt: string;
};

export function createIssues(store: EventStore<GeordiEvent>) {
	// Mutates the map in place: replay stays O(n), and readers get fresh copies via list/get.
	const projection = store.project(
		'issues',
		() => new Map<number, Issue>(),
		(issues, event) => {
			switch (event.type) {
				case 'issue.opened': {
					const { number, title, body } = event.data;
					const { at, actor } = event;
					issues.set(number, {
						number,
						title,
						body,
						state: 'open',
						openedAt: at,
						openedBy: actor,
						updatedAt: at
					});
					break;
				}
				case 'issue.closed':
				case 'issue.reopened': {
					const issue = issues.get(event.data.number);
					if (issue) {
						issue.state = event.type === 'issue.closed' ? 'closed' : 'open';
						issue.updatedAt = event.at;
					}
					break;
				}
			}
			return issues;
		}
	);

	function get(number: number): Issue {
		const issue = projection.get().get(number);
		if (!issue) error(404, `Issue #${number} not found`);
		return { ...issue };
	}

	function setState(number: number, state: Issue['state'], actor: string | null) {
		if (get(number).state === state) return;
		const type = state === 'closed' ? 'issue.closed' : 'issue.reopened';
		store.append({ type, stream: `issue:${number}`, data: { number } }, { actor });
	}

	return {
		/** All issues, newest first. */
		list: (): Issue[] => [...projection.get().values()].reverse().map((issue) => ({ ...issue })),
		get,

		open({ title, body }: { title: string; body: string }, actor: string | null = null): number {
			const number = projection.get().size + 1;
			store.append(
				{ type: 'issue.opened', stream: `issue:${number}`, data: { number, title, body } },
				{ actor }
			);
			return number;
		},

		close: (number: number, actor: string | null = null) => setState(number, 'closed', actor),
		reopen: (number: number, actor: string | null = null) => setState(number, 'open', actor)
	};
}
