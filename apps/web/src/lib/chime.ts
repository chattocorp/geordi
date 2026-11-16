/**
 * The sound Geordi makes when an agent is done (FDR-008): two soft notes, rising when all
 * went well, falling when something went wrong. Made here rather than shipped as a file,
 * and played by an audio element in browsers. The desktop app ships it as files, which the
 * system plays with its notifications (see `desktop` in `notifications.svelte.ts`).
 */

/** The chime as a WAV file: 16 bits, one channel. */
/** `peak` is how loud it gets, of 1: quiet by default, as something played over other sound. */
export function chimeWav(failed: boolean, peak = 0.08): Uint8Array {
	const RATE = 44_100;
	const notes = failed ? [659.25, 493.88] : [659.25, 880];
	const [apart, length, attack] = [0.13, 0.5, 0.01];
	const samples = new Float32Array(Math.ceil((apart * (notes.length - 1) + length) * RATE));
	notes.forEach((frequency, index) => {
		const from = Math.round(index * apart * RATE);
		for (let i = 0; i < length * RATE; i++) {
			const t = i / RATE;
			// in at once, then dying away
			const level = t < attack ? t / attack : Math.exp((-9 * (t - attack)) / (length - attack));
			samples[from + i] += peak * level * Math.sin(2 * Math.PI * frequency * t);
		}
	});

	const wav = new DataView(new ArrayBuffer(44 + samples.length * 2));
	const text = (at: number, value: string) =>
		[...value].forEach((char, i) => wav.setUint8(at + i, char.charCodeAt(0)));
	text(0, 'RIFF');
	wav.setUint32(4, 36 + samples.length * 2, true);
	text(8, 'WAVEfmt ');
	wav.setUint32(16, 16, true); // the size of what follows, for plain samples
	wav.setUint16(20, 1, true); // plain samples
	wav.setUint16(22, 1, true); // one channel
	wav.setUint32(24, RATE, true);
	wav.setUint32(28, RATE * 2, true); // bytes a second
	wav.setUint16(32, 2, true); // bytes a sample
	wav.setUint16(34, 16, true); // bits a sample
	text(36, 'data');
	wav.setUint32(40, samples.length * 2, true);
	samples.forEach((sample, i) =>
		wav.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32_767), true)
	);
	return new Uint8Array(wav.buffer);
}
