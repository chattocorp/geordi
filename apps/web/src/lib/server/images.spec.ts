import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_IMAGES } from '@geordi/protocol';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createImages } from './images.ts';

export const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
	'base64'
);

describe('message images', () => {
	it('recovers both an inline image and deduplicated blobs after a restart', () => {
		const directory = mkdtempSync(join(tmpdir(), 'geordi-images-'));
		const path = join(directory, 'events.db');
		const image = { mediaType: 'image/png', data: png.toString('base64') } as const;
		let store = new EventStore<GeordiEvent>(path);
		try {
			store.append({ type: 'image.added', stream: 'image:old', data: { id: 'old', image } });
			const first = createImages(store).add(png, 'person');
			const second = createImages(store).add(png);
			const files = readdirSync(join(directory, 'blobs'));
			expect(files).toHaveLength(1);
			expect(readFileSync(join(directory, 'blobs', files[0]))).toEqual(png);
			expect(store.readStream(`image:${first}`)[0]).toMatchObject({
				actor: 'person',
				data: { id: first, mediaType: image.mediaType, blob: files[0] }
			});
			expect(store.readStream(`image:${first}`)[0].data).not.toHaveProperty('image');
			store.close();
			store = new EventStore<GeordiEvent>(path);
			expect(createImages(store).resolve(['old', first, second])).toEqual([image, image, image]);
		} finally {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('rejects unsupported content, empty images, excessive size and missing IDs', () => {
		const images = createImages(new EventStore<GeordiEvent>(':memory:'));
		for (const bytes of [
			Buffer.alloc(0),
			Buffer.from('<svg/>'),
			Buffer.from('not an image'),
			Buffer.alloc(MAX_IMAGE_BYTES + 1)
		]) {
			expect(() => images.add(bytes)).toThrow();
		}
		expect(() => images.get('missing')).toThrow();
		expect(() => images.resolve(Array(MAX_IMAGES + 1).fill('missing'))).toThrow();
	});
});
