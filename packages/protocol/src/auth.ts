import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Mutual challenge-response between forge and daemon, based on the shared token. The token
 * itself never crosses the wire, and each side proves it knows it before the other trusts it:
 *
 *   forge  → challenge { nonce: F }
 *   daemon → hello     { nonce: D, proof: HMAC(token, "daemon:" + F) }
 *   forge  → welcome   { proof: HMAC(token, "forge:" + D) }
 */
export const createNonce = (): string => randomBytes(32).toString('base64url');

export const prove = (token: string, role: 'daemon' | 'forge', nonce: string): string =>
	createHmac('sha256', token).update(`${role}:${nonce}`).digest('base64url');

export function verify(
	token: string,
	role: 'daemon' | 'forge',
	nonce: string,
	proof: unknown
): boolean {
	if (typeof proof !== 'string') return false;
	const expected = Buffer.from(prove(token, role, nonce));
	const actual = Buffer.from(proof);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
