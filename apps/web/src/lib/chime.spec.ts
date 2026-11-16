import { describe, expect, it } from 'vitest';
import { chimeWav } from './chime.ts';

describe('chimeWav', () => {
	const text = (wav: Uint8Array, at: number, length: number) =>
		String.fromCharCode(...wav.slice(at, at + length));

	it('is a WAV file a player will take: 16 bits, one channel, as long as it says', () => {
		const wav = chimeWav(false);
		const view = new DataView(wav.buffer);
		expect(text(wav, 0, 4)).toBe('RIFF');
		expect(text(wav, 8, 8)).toBe('WAVEfmt ');
		expect(text(wav, 36, 4)).toBe('data');
		expect(view.getUint32(4, true)).toBe(wav.length - 8);
		expect(view.getUint32(40, true)).toBe(wav.length - 44);
		expect([view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true)]).toEqual([
			1, 44_100, 16
		]);
		// about two thirds of a second
		expect(wav.length - 44).toBe(Math.ceil(0.63 * 44_100) * 2);
	});

	it('is quiet, and fades out', () => {
		const view = new DataView(chimeWav(true).buffer);
		const samples = Array.from({ length: (view.byteLength - 44) / 2 }, (_, i) =>
			Math.abs(view.getInt16(44 + i * 2, true))
		);
		expect(Math.max(...samples)).toBeLessThan(0.2 * 32_767);
		expect(Math.max(...samples)).toBeGreaterThan(0.03 * 32_767);
		expect(Math.max(...samples.slice(-200))).toBeLessThan(20);
	});

	it('sounds different when something went wrong', () => {
		expect(chimeWav(true)).not.toEqual(chimeWav(false));
	});
});
