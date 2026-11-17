import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { MAX_IMAGE_BYTES, MAX_IMAGES, type MessageImage } from '@geordi/protocol';
import type { EventStore, GeordiEvent } from './events/index.ts';

export type ImageEvent = {
	type: 'image.added';
	stream: `image:${string}`;
	data: { id: string; image: MessageImage };
};

/** Images are stored once; messages and live views carry only their IDs. */
export function createImages(store: EventStore<GeordiEvent>) {
	function get(id: string): MessageImage {
		const event = store.readStream(`image:${id}`).find((event) => event.type === 'image.added');
		if (!event || event.type !== 'image.added') error(404, 'Image not found');
		return event.data.image;
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
			const head = buffer.subarray(0, 12);
			let mediaType: MessageImage['mediaType'];
			if (head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
				mediaType = 'image/png';
			else if (head[0] === 255 && head[1] === 216 && head[2] === 255) mediaType = 'image/jpeg';
			else if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP')
				mediaType = 'image/webp';
			else if (['GIF87a', 'GIF89a'].includes(head.toString('ascii', 0, 6))) mediaType = 'image/gif';
			else error(400, 'Choose a PNG, JPEG, WebP or GIF image');
			const id = randomUUID();
			store.append(
				{
					type: 'image.added',
					stream: `image:${id}`,
					data: { id, image: { mediaType, data: buffer.toString('base64') } }
				},
				{ actor }
			);
			return id;
		}
	};
}
