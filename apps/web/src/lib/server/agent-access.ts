import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { EventStore, GeordiEvent } from './events/index.ts';

type Grant = { id: string; name: string; digest: string };
export type AccessEvent =
	| { type: 'access.granted'; stream: `access:${string}`; data: Grant & { repoId?: string } }
	| { type: 'access.revoked'; stream: `access:${string}`; data: { id: string } };

const digest = (token: string) => createHash('sha256').update(token).digest();

export function createAgentAccess(store: EventStore<GeordiEvent>) {
	const names = new Map<string, string>();
	const grants = store.project(
		'agent-access',
		() => new Map<string, Grant>(),
		(all, event) => {
			if (event.type === 'access.granted') {
				// A token issued for one repository cannot acquire installation-wide access on replay.
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
		issue(name: string) {
			const id = 'external:' + randomUUID();
			const token = id + '.' + randomBytes(32).toString('base64url');
			store.append({
				type: 'access.granted',
				stream: `access:${id}`,
				data: { id, name, digest: digest(token).toString('hex') }
			});
			return token;
		},
		revoke(id: string) {
			store.append({ type: 'access.revoked', stream: `access:${id}`, data: { id } });
		},
		list: () => [...grants.get().values()].map(({ id, name }) => ({ id, name })),
		authenticate(token: string) {
			const grant = grants.get().get(token.split('.')[0]);
			return grant && timingSafeEqual(Buffer.from(grant.digest, 'hex'), digest(token))
				? grant.id
				: null;
		}
	};
}
