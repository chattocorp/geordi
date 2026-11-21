/**
 * Whether a repository's icon needs a pale plate to be seen on a dark surface: a mark that
 * is mostly dark and has no background of its own (a black logo). A picture that fills its
 * square brings its own background, and needs only an edge (`picture-edge`).
 */

/** How small the picture is drawn to be measured: enough to tell, cheap to read. */
const SIZE = 16;
/** Below this much of the square covered, the picture has no background of its own. */
const COVERED = 0.5;
/** Below this luminance (0 to 1), averaged over what is drawn, a mark is dark. */
const DARK = 0.3;

/** From RGBA pixels: is this a dark mark without a background? */
export function isDarkMark(pixels: ArrayLike<number>): boolean {
	let alpha = 0;
	let light = 0;
	for (let i = 0; i < pixels.length; i += 4) {
		const a = pixels[i + 3] / 255;
		alpha += a;
		light += (a * (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2])) / 255;
	}
	if (alpha === 0) return false;
	return alpha / (pixels.length / 4) < COVERED && light / alpha < DARK;
}

export function needsPlate(image: HTMLImageElement): boolean {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = SIZE;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return false;
	try {
		context.drawImage(image, 0, 0, SIZE, SIZE);
		return isDarkMark(context.getImageData(0, 0, SIZE, SIZE).data);
	} catch {
		return false; // a picture that can't be read is shown as it is
	}
}
