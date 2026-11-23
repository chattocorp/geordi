/** A tone as a WAV file in base64, pulsing as it fades: for stories of sound. */
export function tone(frequency = 440, seconds = 0.5) {
	const rate = 8000;
	const samples = Math.round(rate * seconds);
	const view = new DataView(new ArrayBuffer(44 + samples));
	const text = (at: number, value: string) =>
		[...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
	text(0, 'RIFF');
	view.setUint32(4, 36 + samples, true);
	text(8, 'WAVEfmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, rate, true);
	view.setUint32(28, rate, true);
	view.setUint16(32, 1, true);
	view.setUint16(34, 8, true);
	text(36, 'data');
	view.setUint32(40, samples, true);
	for (let index = 0; index < samples; index++)
		view.setUint8(
			44 + index,
			128 +
				100 *
					(1 - index / samples) *
					(0.6 + 0.4 * Math.sin((2 * Math.PI * 4 * index) / rate)) *
					Math.sin((2 * Math.PI * frequency * index) / rate)
		);
	return btoa(String.fromCharCode(...new Uint8Array(view.buffer)));
}
