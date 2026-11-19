import type { ReleasePackage } from '@geordi/protocol';

/** A single Changesets note can name several packages. */
export function addedNoteCount(packages: ReleasePackage[]) {
	return new Set(
		packages.flatMap((pkg) => pkg.notes.filter((note) => note.added).map((note) => note.path))
	).size;
}
