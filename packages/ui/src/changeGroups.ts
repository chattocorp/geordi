import type { FileChange } from '@geordi/protocol';

export type ChangeRow =
	| { path: string; file: FileChange }
	| { path: string; children: ChangeRow[]; count: number; added: number; removed: number };

/** Paths include the trailing slash on folders, so a file and folder can share a name. */
export function groupChanges(files: FileChange[], prefix = ''): ChangeRow[] {
	const buckets = new Map<string, FileChange[]>();
	for (const file of files) {
		const slash = file.path.indexOf('/', prefix.length);
		const path = slash < 0 ? file.path : file.path.slice(0, slash + 1);
		const bucket = buckets.get(path);
		if (bucket) bucket.push(file);
		else buckets.set(path, [file]);
	}

	return Array.from(buckets, ([path, bucket]) => {
		const first = bucket[0];
		if (bucket.length === 1) return { path: first.path, file: first };

		// Skip every directory that would only lead to another directory row.
		let end = path.length;
		for (
			let slash = first.path.indexOf('/', end);
			slash >= 0;
			slash = first.path.indexOf('/', end)
		) {
			const shared = first.path.slice(0, slash + 1);
			if (!bucket.every((file) => file.path.startsWith(shared))) break;
			end = slash + 1;
		}
		const shared = first.path.slice(0, end);
		return {
			path: shared,
			children: groupChanges(bucket, shared),
			count: bucket.length,
			added: bucket.reduce((sum, file) => sum + (file.added ?? 0), 0),
			removed: bucket.reduce((sum, file) => sum + (file.removed ?? 0), 0)
		};
	});
}
