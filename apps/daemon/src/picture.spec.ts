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
	const SVG =
		'\uFEFF<?xml version="1.0"?>\n<!-- drawn by hand -->\n<!DOCTYPE svg>\n<svg xmlns="http://www.w3.org/2000/svg"/>';
	writeFileSync(join(dir, 'chart.svg'), SVG);
	writeFileSync(join(dir, 'page.svg'), '<html><svg></svg></html>');

	it('reads a picture from the working directory, or from anywhere by its full path', () => {
		const picture = { mediaType: 'image/png', data: PNG.toString('base64') };
		expect(readPicture(dir, 'shot.png')).toEqual(picture);
		expect(readPicture(dir, './shot.png')).toEqual(picture);
		expect(readPicture('/', join(dir, 'shot.png'))).toEqual(picture);
	});

	it('reads an SVG, known by its first element', () => {
		expect(readPicture(dir, 'chart.svg')?.mediaType).toBe('image/svg+xml');
		expect(readPicture(dir, 'page.svg')).toBeNull();
	});

	it('reads a sound, known by how it begins', () => {
		writeFileSync(join(dir, 'jump.wav'), 'RIFF\0\0\0\0WAVEfmt ');
		expect(readPicture(dir, 'jump.wav')?.mediaType).toBe('audio/wav');
	});

	it('answers with nothing but pictures', () => {
		expect(readPicture(dir, 'notes.png')).toBeNull();
		expect(readPicture(dir, 'empty.png')).toBeNull();
		expect(readPicture(dir, 'missing.png')).toBeNull();
		expect(readPicture(dir, '.')).toBeNull();
	});
});
