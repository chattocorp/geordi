import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { EventStore, GeordiEvent } from './events/index.ts';

/**
 * A named token a person issued to an MCP client outside Geordi (ADR-004), for the
 * repositories they chose (`repoIds`). It never reaches repositories added later.
 */
type Grant = { id: string; name: string; digest: string; repoIds: string[] };
export type AccessEvent =
	/**
	 * Without `repoIds`: an older token: of a preview, for one repository (`repoId`), or of 0.5.0, for
	 * all of them. It is no longer valid.
	 */
	| {
			type: 'access.granted';
			stream: `access:${string}`;
			data: Omit<Grant, 'repoIds'> & { repoIds?: string[]; repoId?: string };
	  }
	| { type: 'access.revoked'; stream: `access:${string}`; data: { id: string } };

/** What every grant's ID, and so every external caller, starts with. */
const PREFIX = 'external:';
export const isExternal = (caller: string) => caller.startsWith(PREFIX);

const digest = (token: string) => createHash('sha256').update(token).digest();

export function createAgentAccess(
	store: EventStore<GeordiEvent>,
	/** Throws unless there is a repository with this ID. */
	ensureRepo: (id: string) => unknown
) {
	/** Every grant's name, revoked ones too: what they said is still theirs. */
	const names = new Map<string, string>();
	const grants = store.project(
		'agent-access',
		() => new Map<string, Grant>(),
		(all, event) => {
			if (event.type === 'access.granted') {
				// an older token must not gain access to every repository on replay
				const { repoIds } = event.data;
				if (repoIds) all.set(event.data.id, { ...event.data, repoIds });
				names.set(event.data.id, event.data.name);
			}
			if (event.type === 'access.revoked') all.delete(event.data.id);
			// IDs of repositories are reused: one added again later must not be reached
			if (event.type === 'repo.removed')
				for (const [id, grant] of all)
					all.set(id, { ...grant, repoIds: grant.repoIds.filter((r) => r !== event.data.id) });
			return all;
		},
		['access', 'repo']
	);
	return {
		name: (id: string) => names.get(id),
		/** Issues a token, which is returned once and stored only as its digest. */
		issue(name: string, repoIds: string[]) {
			repoIds = [...new Set(repoIds)];
			if (repoIds.length === 0) error(400, 'Choose at least one repository');
			repoIds.forEach(ensureRepo);
			const id = PREFIX + randomUUID();
			const token = id + '.' + randomBytes(32).toString('base64url');
			store.append({
				type: 'access.granted',
				stream: `access:${id}`,
				data: { id, name, repoIds, digest: digest(token).toString('hex') }
			});
			return token;
		},
		revoke(id: string) {
			if (!grants.get().has(id)) error(404, 'There is no such token');
			store.append({ type: 'access.revoked', stream: `access:${id}`, data: { id } });
		},
		list: () => [...grants.get().values()].map(({ id, name, repoIds }) => ({ id, name, repoIds })),
		/** Whether an external caller may see what is in a repository. */
		reaches: (id: string, repoId: string) => !!grants.get().get(id)?.repoIds.includes(repoId),
		/** The grant a valid token belongs to, or `null`. */
		authenticate(token: string) {
			const grant = grants.get().get(token.split('.')[0]);
			return grant && timingSafeEqual(Buffer.from(grant.digest, 'hex'), digest(token))
				? grant.id
				: null;
		}
	};
}
