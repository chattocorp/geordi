import { describe, expect, it } from 'vitest';
import { soundTypeOf } from '@geordi/protocol';

const bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

describe('soundTypeOf', () => {
	it('knows sound files by how they begin', () => {
		expect(soundTypeOf(bytes('RIFF\0\0\0\0WAVEfmt '))).toBe('audio/wav');
		expect(soundTypeOf(bytes('OggS\0\x02'))).toBe('audio/ogg');
		expect(soundTypeOf(bytes('fLaC\0\0\0\x22'))).toBe('audio/flac');
		expect(soundTypeOf(bytes('\0\0\0\x20ftypM4A \0\0\0\0'))).toBe('audio/mp4');
		expect(soundTypeOf(bytes('ID3\x04\0\0'))).toBe('audio/mpeg');
		expect(soundTypeOf(Uint8Array.of(0xff, 0xfb, 0x90, 0x64))).toBe('audio/mpeg');
	});

	it('leaves everything else alone', () => {
		expect(soundTypeOf(bytes('RIFF\0\0\0\0WEBPVP8 '))).toBeNull();
		expect(soundTypeOf(bytes('\0\0\0\x20ftypisom'))).toBeNull();
		expect(soundTypeOf(Uint8Array.of(0xff, 0xf1, 0x50, 0x80))).toBeNull();
		expect(soundTypeOf(bytes('hello'))).toBeNull();
		// UTF-16 text, and text that merely begins like an ID3 tag
		expect(soundTypeOf(Uint8Array.of(0xff, 0xfe, 0x61, 0x00))).toBeNull();
		expect(soundTypeOf(bytes('ID3 tags are nice'))).toBeNull();
		// a reserved version, a free or bad bitrate, a reserved sample rate
		expect(soundTypeOf(Uint8Array.of(0xff, 0xeb, 0x90, 0x64))).toBeNull();
		expect(soundTypeOf(Uint8Array.of(0xff, 0xfb, 0x00, 0x64))).toBeNull();
		expect(soundTypeOf(Uint8Array.of(0xff, 0xfb, 0xf0, 0x64))).toBeNull();
		expect(soundTypeOf(Uint8Array.of(0xff, 0xfb, 0x9c, 0x64))).toBeNull();
		expect(soundTypeOf(new Uint8Array())).toBeNull();
	});
});
