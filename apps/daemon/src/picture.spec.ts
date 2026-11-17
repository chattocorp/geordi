import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPicture } from './picture.ts';

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);

describe('readPicture', () => {
	const dir = mkdtempSync(join(tmpdir(), 'geordi-picture-'));
	writeFileSync(join(dir, 'shot.png'), PNG);
	writeFileSync(join(dir, 'notes.png'), 'a secret, named like a picture');
	writeFileSync(join(dir, 'empty.png'), '');

	it('reads a picture from the working directory, or from anywhere by its full path', () => {
		const picture = { mediaType: 'image/png', data: PNG.toString('base64') };
		expect(readPicture(dir, 'shot.png')).toEqual(picture);
		expect(readPicture(dir, './shot.png')).toEqual(picture);
		expect(readPicture('/', join(dir, 'shot.png'))).toEqual(picture);
	});

	it('answers with nothing but pictures', () => {
		expect(readPicture(dir, 'notes.png')).toBeNull();
		expect(readPicture(dir, 'empty.png')).toBeNull();
		expect(readPicture(dir, 'missing.png')).toBeNull();
		expect(readPicture(dir, '.')).toBeNull();
	});
});
