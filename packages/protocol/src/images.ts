/** Raster formats understood by both agent CLIs. SVG is deliberately excluded. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 4;
export type MessageImage = { mediaType: (typeof IMAGE_TYPES)[number]; data: string };
