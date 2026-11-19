import { spawn } from 'node:child_process';
import { FILE_SEARCH_TIMEOUT_MS, type FileMatch } from '@geordi/protocol';
import { fuzzyMatch } from '@geordi/protocol/fuzzy';
import { gitEnv, type Worktree } from './worktree.ts';

export type FileSource = { repoPath: string; revision: string } | { worktree: Worktree };
const LIMIT = 40;

/** A cheap rejection before scoring a full path. Collisions only admit extra candidates. */
function characterMask(lower: string) {
	let mask = 0;
	for (let i = 0; i < lower.length; i++) {
		const code = lower.charCodeAt(i);
		if (code >= 97 && code <= 122) mask |= 1 << (code - 97);
		else if (code >= 48 && code <= 57) mask |= 1 << (26 + ((code - 48) % 6));
	}
	return mask;
}

/** Stream NUL-delimited paths. UTF-8 characters and path names can both span chunks. */
async function list(
	source: FileSource,
	signal: AbortSignal,
	args: string[],
	visit: (path: string) => void
) {
	const worktree = 'worktree' in source ? source.worktree : undefined;
	const child = spawn('git', ['--literal-pathspecs', ...args], {
		cwd: 'repoPath' in source ? source.repoPath : source.worktree.path,
		env: worktree ? gitEnv(worktree) : process.env,
		stdio: ['ignore', 'pipe', 'pipe'],
		signal,
		killSignal: 'SIGKILL'
	});
	let diagnostic = '';
	child.stderr.setEncoding('utf8').on('data', (chunk) => {
		diagnostic = (diagnostic + chunk).slice(-2048);
	});
	const closed = new Promise<void>((resolve, reject) => {
		child.once('error', reject);
		child.once('close', (code) =>
			code === 0 ? resolve() : reject(new Error(diagnostic || 'Could not list repository files'))
		);
	});
	await Promise.all([
		closed,
		(async () => {
			let tail = '';
			for await (const chunk of child.stdout.setEncoding('utf8')) {
				const names = (tail + chunk).split('\0');
				tail = names.pop()!;
				for (const name of names) visit(name);
			}
		})()
	]);
}

/** Git order breaks score ties. Only the first forty copies of a basename can win a
 * filename match. All paths remain searchable for directory and cross-directory queries. */
export class FileIndex {
	private paths: string[] = [];
	private masks: number[] = [];
	private byName = new Map<string, { first: number; mask: number; others?: number[] }>();

	add(path: string) {
		const id = this.paths.length;
		this.paths.push(path);
		this.masks.push(characterMask(path.toLowerCase()));
		const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
		const group = this.byName.get(name);
		if (!group) this.byName.set(name, { first: id, mask: characterMask(name) });
		else {
			const others = (group.others ??= []);
			if (others.length < LIMIT - 1) others.push(id);
		}
	}

	search(query: string): FileMatch[] {
		if (!query) return this.paths.slice(0, LIMIT).map((path) => ({ path, indices: [] }));
		type Candidate = {
			id: number;
			tier: number;
			score: number;
		};
		const best: Candidate[] = [];
		const compare = (a: Candidate, b: Candidate) =>
			a.tier - b.tier || b.score - a.score || a.id - b.id;
		function offer(id: number, tier: number, score: number) {
			const candidate = { id, tier, score };
			if (best.length === LIMIT && compare(candidate, best[LIMIT - 1]) >= 0) return;
			const at = best.findIndex((other) => compare(candidate, other) < 0);
			best.splice(at < 0 ? best.length : at, 0, candidate);
			if (best.length > LIMIT) best.pop();
		}
		const wanted = query.toLowerCase();
		const required = characterMask(wanted);
		function offerGroup(group: { first: number; others?: number[] }, tier: number, score: number) {
			offer(group.first, tier, score);
			for (const id of group.others ?? []) offer(id, tier, score);
		}

		// Exact names are a direct lookup. Once forty prefixes win, later groups in
		// Git order cannot displace them: every prefix has the same fuzzy score.
		const exact = this.byName.get(wanted);
		if (exact) offerGroup(exact, 0, 0);
		if (!wanted.includes('/')) {
			for (const [name, group] of this.byName) {
				const last = best[LIMIT - 1];
				if (last && (last.tier === 0 || (last.tier === 1 && group.first > last.id))) break;
				if (group === exact || (group.mask & required) !== required) continue;
				if (name.startsWith(wanted)) offerGroup(group, 1, 0);
				else {
					const match = fuzzyMatch(wanted, name);
					if (match) offerGroup(group, 2, match.score);
				}
			}
		}
		if (best.length < LIMIT) {
			const named = new Set(best.map((hit) => hit.id));
			for (let id = 0; id < this.paths.length; id++) {
				if ((this.masks[id] & required) !== required || named.has(id)) continue;
				const match = fuzzyMatch(wanted, this.paths[id]);
				if (match) offer(id, 3, match.score);
			}
		}
		return best.map(({ id, tier }) => {
			const path = this.paths[id];
			const offset = tier === 3 ? 0 : path.lastIndexOf('/') + 1;
			const { indices } = fuzzyMatch(wanted, path.slice(offset))!;
			return { path, indices: indices.map((i) => i + offset) };
		});
	}
}

export async function buildFileIndex(source: FileSource): Promise<FileIndex> {
	const index = new FileIndex();
	const signal = AbortSignal.timeout(FILE_SEARCH_TIMEOUT_MS);
	if ('revision' in source) {
		await list(source, signal, ['ls-tree', '-rz', '--name-only', source.revision], (path) =>
			index.add(path)
		);
	} else {
		const deleted = new Set<string>();
		await list(
			source,
			signal,
			[
				'diff-files',
				'--no-ext-diff',
				'--no-textconv',
				'--ignore-submodules=all',
				'--no-renames',
				'--diff-filter=D',
				'--name-only',
				'-z'
			],
			(path) => deleted.add(path)
		);
		await list(
			source,
			signal,
			['ls-files', '--cached', '--others', '--exclude-standard', '--deduplicate', '-z'],
			(path) => {
				if (!deleted.has(path)) index.add(path);
			}
		);
	}
	return index;
}
