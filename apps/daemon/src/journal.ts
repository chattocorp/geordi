import { closeSync, existsSync, openSync, readSync } from 'node:fs';

/** Every complete line of a file from `offset` on, with where the next one starts. */
export function* linesFrom(path: string, offset: number): Generator<{ line: string; end: number }> {
	if (!existsSync(path)) return;
	const from = openSync(path, 'r');
	try {
		let parts: Buffer[] = [];
		const chunk = Buffer.alloc(64 * 1024);
		for (let n; (n = readSync(from, chunk, 0, chunk.length, offset)) > 0; offset += n) {
			const bytes = chunk.subarray(0, n);
			let start = 0;
			for (let at; (at = bytes.indexOf(10, start)) >= 0; start = at + 1) {
				const tail = bytes.subarray(start, at);
				const line = parts.length ? Buffer.concat([...parts, tail]) : tail;
				parts = [];
				yield { line: line.toString('utf8'), end: offset + at + 1 };
			}
			if (start < n) parts.push(Buffer.from(bytes.subarray(start)));
		}
	} finally {
		closeSync(from);
	}
}
