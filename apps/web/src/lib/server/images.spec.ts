import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_IMAGES } from '@geordi/protocol';
import { EventStore, type GeordiEvent } from './events/index.ts';
import { createImages } from './images.ts';

export const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
	'base64'
);

describe('message images', () => {
	it('stores bytes once with an actor and recovers them from the event log', () => {
		const store = new EventStore<GeordiEvent>(':memory:');
		const id = createImages(store).add(png, 'person');
		expect(store.readAll()).toMatchObject([{ type: 'image.added', actor: 'person' }]);
		expect(createImages(store).get(id)).toEqual({
			mediaType: 'image/png',
			data: png.toString('base64')
		});
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
