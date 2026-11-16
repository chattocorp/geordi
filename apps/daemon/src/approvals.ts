import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The run commands a person has agreed to run, by repository (FDR-006). A repository's
 * `.geordi.toml` is the agent's to write, and so are the repository's branches: nothing in
 * there can say that a command is fine to run as the person. Only the person can, and what
 * they said is kept here, in a file of the daemon's own that no agent's sandbox can write.
 */
export function createApprovals(file: string) {
	const read = (): Record<string, string[]> => {
		try {
			const stored: unknown = JSON.parse(readFileSync(file, 'utf8'));
			return stored && typeof stored === 'object' ? (stored as Record<string, string[]>) : {};
		} catch {
			return {}; // nothing agreed to yet
		}
	};

	return {
		has: (repoPath: string, command: string) => read()[repoPath]?.includes(command) === true,

		add(repoPath: string, command: string) {
			const all = read();
			if (all[repoPath]?.includes(command)) return;
			all[repoPath] = [...(all[repoPath] ?? []), command];
			mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
			// renamed into place: a half-written file would forget everything agreed to
			writeFileSync(`${file}.tmp`, JSON.stringify(all, null, '\t'), { mode: 0o600 });
			renameSync(`${file}.tmp`, file);
		}
	};
}
