import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { EventStore, GeordiEvent } from './events/index.ts';

type Grant = { id: string; name: string; repoId: string; digest: string };
export type AccessEvent =
	| { type: 'access.granted'; stream: `access:${string}`; data: Grant }
	| { type: 'access.revoked'; stream: `access:${string}`; data: { id: string } };

const digest = (token: string) => createHash('sha256').update(token).digest();

export function createAgentAccess(store: EventStore<GeordiEvent>) {
	const names = new Map<string, string>();
	const grants = store.project(
		'agent-access',
		() => new Map<string, Grant>(),
		(all, event) => {
			if (event.type === 'access.granted') {
				all.set(event.data.id, event.data);
				names.set(event.data.id, event.data.name);
			}
			if (event.type === 'access.revoked') all.delete(event.data.id);
			if (event.type === 'repo.removed') {
				for (const grant of all.values()) if (grant.repoId === event.data.id) all.delete(grant.id);
			}
			return all;
		},
		['access', 'repo']
	);
	return {
		name: (id: string) => names.get(id),
		issue(repoId: string, name: string) {
			const id = 'external:' + randomUUID();
			const token = id + '.' + randomBytes(32).toString('base64url');
			store.append({
				type: 'access.granted',
				stream: `access:${id}`,
				data: { id, repoId, name, digest: digest(token).toString('hex') }
			});
			return token;
		},
		revoke(id: string) {
			store.append({ type: 'access.revoked', stream: `access:${id}`, data: { id } });
		},
		list: () => [...grants.get().values()].map(({ id, name, repoId }) => ({ id, name, repoId })),
		get: (id: string) => grants.get().get(id),
		authenticate(token: string) {
			const grant = grants.get().get(token.split('.')[0]);
			return grant && timingSafeEqual(Buffer.from(grant.digest, 'hex'), digest(token))
				? grant.id
				: null;
		}
	};
}
