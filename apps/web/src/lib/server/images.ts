import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { MAX_IMAGE_BYTES, MAX_IMAGES, imageTypeOf, type MessageImage } from '@geordi/protocol';
import type { EventStore, GeordiEvent } from './events/index.ts';

export type ImageEvent = {
	type: 'image.added';
	stream: `image:${string}`;
	data:
		| { id: string; image: MessageImage }
		| { id: string; mediaType: MessageImage['mediaType']; blob: string };
};

// In-memory databases have the same lifetime as their blobs.
const memory = new WeakMap<EventStore<GeordiEvent>, Map<string, Buffer>>();

/** Images are stored once; messages and live views carry only their IDs. */
export function createImages(store: EventStore<GeordiEvent>) {
	const directory = join(dirname(store.path), 'blobs');
	if (store.path === ':memory:' && !memory.has(store)) memory.set(store, new Map());
	const blobs = memory.get(store);

	function save(buffer: Buffer, hash: string) {
		if (blobs) return void blobs.set(hash, buffer);
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		const path = join(directory, hash);
		if (existsSync(path)) return;
		const temp = join(directory, randomUUID());
		try {
			writeFileSync(temp, buffer, { flag: 'wx', mode: 0o600, flush: true });
			renameSync(temp, path);
		} finally {
			rmSync(temp, { force: true });
		}
	}
	function get(id: string): MessageImage {
		const event = store.readStream(`image:${id}`).find((event) => event.type === 'image.added');
		if (!event || event.type !== 'image.added') error(404, 'Image not found');
		if ('image' in event.data) return event.data.image;
		const { blob, mediaType } = event.data;
		if (!/^[a-f0-9]{64}$/.test(blob)) throw new Error('Invalid image reference');
		const buffer = blobs?.get(blob) ?? readFileSync(join(directory, blob));
		return { mediaType, data: buffer.toString('base64') };
	}
	return {
		get,
		resolve(ids: string[]): MessageImage[] {
			if (ids.length > MAX_IMAGES) error(400, `Add up to ${MAX_IMAGES} images per message`);
			return ids.map(get);
		},
		add(bytes: Uint8Array, actor: string | null = null): string {
			if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
				error(400, 'Images must be at most 5 MB');
			const buffer = Buffer.from(bytes);
			const mediaType = imageTypeOf(buffer);
			if (!mediaType) error(400, 'Choose a PNG, JPEG, WebP or GIF image');
			const id = randomUUID();
			const blob = createHash('sha256').update(buffer).digest('hex');
			save(buffer, blob);
			store.append(
				{
					type: 'image.added',
					stream: `image:${id}`,
					data: { id, mediaType, blob }
				},
				{ actor }
			);
			return id;
		}
	};
}
