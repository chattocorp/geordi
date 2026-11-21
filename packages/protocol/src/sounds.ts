/** Sound formats the browsers Geordi runs in can all play. */
export const SOUND_TYPES = [
	'audio/wav',
	'audio/mpeg',
	'audio/ogg',
	'audio/flac',
	'audio/mp4'
] as const;
export type SoundType = (typeof SOUND_TYPES)[number];
/** A sound file, as it is served: its media type, and its bytes in base64. */
export type Sound = { mediaType: SoundType; data: string };

/** Which of those formats these bytes are, going by how they begin: never by a name. */
export function soundTypeOf(bytes: Uint8Array): SoundType | null {
	const starts = (text: string, at = 0) =>
		[...text].every((char, index) => bytes[at + index] === char.charCodeAt(0));
	if (starts('RIFF') && starts('WAVE', 8)) return 'audio/wav';
	if (starts('OggS')) return 'audio/ogg';
	if (starts('fLaC')) return 'audio/flac';
	if (starts('ftyp', 4) && starts('M4A ', 8)) return 'audio/mp4';
	if (starts('ID3') && bytes[3] >= 2 && bytes[3] <= 4 && bytes[4] === 0) return 'audio/mpeg';
	if (isMpegFrame(bytes)) return 'audio/mpeg';
	return null;
}

/**
 * Whether the bytes begin with an MPEG audio frame header (an MP3 without an ID3 tag): every
 * field valid, so that other files (UTF-16 text begins `FF FE`) are not taken for one.
 */
function isMpegFrame(bytes: Uint8Array): boolean {
	if (bytes.length < 4 || bytes[0] !== 0xff || (bytes[1] & 0xe0) !== 0xe0) return false;
	const version = (bytes[1] >> 3) & 3;
	const layer = (bytes[1] >> 1) & 3;
	const bitrate = bytes[2] >> 4;
	const sampleRate = (bytes[2] >> 2) & 3;
	return (
		bytes[1] !== 0xfe &&
		version !== 1 &&
		layer !== 0 &&
		bitrate !== 0 &&
		bitrate !== 15 &&
		sampleRate !== 3
	);
}
