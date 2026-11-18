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

/**
 * What an agent may show of what it made (a screenshot, a chart): those formats, and SVG.
 * The forge serves an SVG so that it can run nothing and load nothing.
 */
export type PictureType = ImageType | 'image/svg+xml';
export type Picture = { mediaType: PictureType; data: string };

/** Which picture format these bytes are: SVG, going by its first element, or a raster one. */
export function pictureTypeOf(bytes: Uint8Array): PictureType | null {
	return imageTypeOf(bytes) ?? (isSvg(bytes) ? 'image/svg+xml' : null);
}

/** Whether the document begins with an `<svg>` element, after what XML lets come first. */
function isSvg(bytes: Uint8Array): boolean {
	let text = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^\uFEFF/, '');
	const prolog = /^\s*(<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)/i;
	for (let match = prolog.exec(text); match; match = prolog.exec(text))
		text = text.slice(match[0].length);
	return /^\s*<svg[\s>/]/.test(text);
}
