/** Raster formats understood by both agent CLIs. SVG is deliberately excluded. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 4;
export type ImageType = (typeof IMAGE_TYPES)[number];
export type MessageImage = { mediaType: ImageType; data: string };

/** Which of those formats these bytes are, going by how they begin: never by a name. */
export function imageTypeOf(bytes: Uint8Array): ImageType | null {
	const starts = (text: string, at = 0) =>
		[...text].every((char, index) => bytes[at + index] === char.charCodeAt(0));
	if (starts('\x89PNG\r\n\x1a\n')) return 'image/png';
	if (starts('\xff\xd8\xff')) return 'image/jpeg';
	if (starts('RIFF') && starts('WEBP', 8)) return 'image/webp';
	if (starts('GIF87a') || starts('GIF89a')) return 'image/gif';
	return null;
}
