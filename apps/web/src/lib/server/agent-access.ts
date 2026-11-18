import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { EventStore, GeordiEvent } from './events/index.ts';

/** A named token a person issued to an MCP client outside Geordi (ADR-004). */
type Grant = { id: string; name: string; digest: string };
export type AccessEvent =
	/** `repoId`: a token of an early preview, for one repository. It is no longer valid. */
	| { type: 'access.granted'; stream: `access:${string}`; data: Grant & { repoId?: string } }
	| { type: 'access.revoked'; stream: `access:${string}`; data: { id: string } };

/** What every grant's ID, and so every external caller, starts with. */
const PREFIX = 'external:';
export const isExternal = (caller: string) => caller.startsWith(PREFIX);

const digest = (token: string) => createHash('sha256').update(token).digest();

export function createAgentAccess(store: EventStore<GeordiEvent>) {
	/** Every grant's name, revoked ones too: what they said is still theirs. */
	const names = new Map<string, string>();
	const grants = store.project(
		'agent-access',
		() => new Map<string, Grant>(),
		(all, event) => {
			if (event.type === 'access.granted') {
				// a token issued for one repository must not gain access to all of them on replay
				if (event.data.repoId === undefined) all.set(event.data.id, event.data);
				names.set(event.data.id, event.data.name);
			}
			if (event.type === 'access.revoked') all.delete(event.data.id);
			return all;
		},
		['access']
	);
	return {
		name: (id: string) => names.get(id),
		/** Issues a token, which is returned once and stored only as its digest. */
		issue(name: string) {
			const id = PREFIX + randomUUID();
			const token = id + '.' + randomBytes(32).toString('base64url');
			store.append({
				type: 'access.granted',
				stream: `access:${id}`,
				data: { id, name, digest: digest(token).toString('hex') }
			});
			return token;
		},
		revoke(id: string) {
			if (!grants.get().has(id)) error(404, 'There is no such token');
			store.append({ type: 'access.revoked', stream: `access:${id}`, data: { id } });
		},
		list: () => [...grants.get().values()].map(({ id, name }) => ({ id, name })),
		/** The grant a valid token belongs to, or `null`. */
		authenticate(token: string) {
			const grant = grants.get().get(token.split('.')[0]);
			return grant && timingSafeEqual(Buffer.from(grant.digest, 'hex'), digest(token))
				? grant.id
				: null;
		}
	};
}
