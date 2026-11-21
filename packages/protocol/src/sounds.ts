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
	// MP3: an ID3 tag, or straight away an MPEG audio frame (layer I to III).
	if (starts('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0))
		return 'audio/mpeg';
	return null;
}
