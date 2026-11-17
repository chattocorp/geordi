import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { MAX_IMAGE_BYTES, imageTypeOf, type MessageImage } from '@geordi/protocol';

/**
 * A picture an agent referred to in what it wrote (a screenshot it took, a chart it drew),
 * for showing it right there. The path is the agent's: from its working directory, from
 * the home directory (`~/`), or absolute, since screenshots tend to end up in `/tmp`. What
 * keeps this from reading out any file is that it only ever answers with a picture: a
 * file that begins as a PNG, JPEG, WebP or GIF does, whatever it is called.
 */
export function readPicture(cwd: string, path: string): MessageImage | null {
	const file = path.startsWith('~/') ? join(homedir(), path.slice(2)) : resolve(cwd, path);
	let fd: number;
	try {
		// never waiting: a named pipe would block the whole daemon otherwise
		fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
	} catch {
		return null;
	}
	try {
		const { size } = fstatSync(fd);
		if (!fstatSync(fd).isFile() || size === 0 || size > MAX_IMAGE_BYTES) return null;
		const bytes = readFileSync(fd);
		const mediaType = imageTypeOf(bytes);
		return mediaType && { mediaType, data: bytes.toString('base64') };
	} catch {
		return null;
	} finally {
		closeSync(fd);
	}
}
