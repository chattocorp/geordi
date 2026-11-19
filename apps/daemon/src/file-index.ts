import { spawn } from 'node:child_process';
import { FILE_SEARCH_TIMEOUT_MS, type FileMatch } from '@geordi/protocol';
import { fuzzyMatch } from '@geordi/protocol/fuzzy';
import { gitEnv, gitIn, headOf, type Worktree } from './worktree.ts';

export type FileSource = { repoPath: string; revision: string } | { worktree: Worktree };
const LIMIT = 40;
export const MAX_FILE_CHANGES = 128;
export type FileChanges = { paths: string[]; gitIndex: boolean };
const SAFE_DIFF = ['--no-ext-diff', '--no-textconv', '--ignore-submodules=all', '--no-renames'];

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

type NameGroup = { created: number; first: number; mask: number; others?: Set<number> };

/** Stable IDs break score ties. Directory entries locate exactly the portion of the
 * index covered by a filesystem notification, including a departed directory's children. */
export class FileIndex {
	private paths: string[] = [];
	private masks: number[] = [];
	private byName = new Map<string, NameGroup>();
	private directories?: Map<string, Map<string, number | null>>;
	private holes = 0;
	// Compare the live Git index with one fixed commit, even if HEAD subsequently moves.
	staging?: { commit: string; changed: Set<string> | null };

	constructor(mutable = true) {
		// A commit index never receives changes. Only worktrees need directory membership.
		if (mutable) this.directories = new Map([['', new Map()]]);
	}

	private directory(path: string): Map<string, number | null> {
		const found = this.directories!.get(path);
		if (found) return found;
		const split = path.lastIndexOf('/');
		this.directory(path.slice(0, Math.max(0, split))).set(path.slice(split + 1), null);
		const entries = new Map<string, number | null>();
		this.directories!.set(path, entries);
		return entries;
	}

	add(path: string) {
		const split = path.lastIndexOf('/');
		const entries = this.directories && this.directory(path.slice(0, Math.max(0, split)));
		const base = path.slice(split + 1);
		if (typeof entries?.get(base) === 'number') return;
		const id = this.paths.length;
		entries?.set(base, id);
		this.paths.push(path);
		this.masks.push(characterMask(path.toLowerCase()));
		const name = base.toLowerCase();
		const group = this.byName.get(name);
		if (!group) this.byName.set(name, { created: id, first: id, mask: characterMask(name) });
		else if (this.directories || (group.others?.size ?? 0) < LIMIT - 1)
			(group.others ??= new Set()).add(id);
	}

	private *under(path: string): Generator<string> {
		const entries = this.directories!.get(path);
		if (!entries) {
			const split = path.lastIndexOf('/');
			if (this.directories!.get(path.slice(0, Math.max(0, split)))?.has(path.slice(split + 1)))
				yield path;
			return;
		}
		for (const [name, id] of entries) {
			if (id === null) yield* this.under(path + '/' + name);
			else yield this.paths[id];
		}
	}

	private remove(path: string) {
		let split = path.lastIndexOf('/');
		const base = path.slice(split + 1);
		let dir = path.slice(0, Math.max(split, 0));
		let entries = this.directories!.get(dir)!;
		const id = entries.get(base)!;
		entries.delete(base);
		while (dir && !entries.size) {
			this.directories!.delete(dir);
			split = dir.lastIndexOf('/');
			const child = dir.slice(split + 1);
			dir = dir.slice(0, Math.max(0, split));
			entries = this.directories!.get(dir)!;
			entries.delete(child);
		}
		this.paths[id] = '';
		this.holes++;
		const name = base.toLowerCase();
		const group = this.byName.get(name)!;
		if (id !== group.first) group.others!.delete(id);
		else {
			const next = group.others?.values().next().value;
			if (next === undefined) this.byName.delete(name);
			else {
				group.first = next;
				group.others!.delete(next);
			}
		}
	}

	/** Apply the batch only after Git has successfully reported every affected scope. */
	reconcile(scopes: string[], visible: Set<string>) {
		const gone = new Set<string>();
		for (const scope of scopes)
			for (const path of this.under(scope)) if (!visible.has(path)) gone.add(path);
		for (const path of gone) this.remove(path);
		for (const path of visible) this.add(path);
		if (this.holes > 4096 && this.holes > this.paths.length / 2) {
			const compact = new FileIndex();
			compact.staging = this.staging;
			for (const path of this.paths) if (path) compact.add(path);
			return compact;
		}
		return this;
	}

	search(query: string): FileMatch[] {
		if (!query) {
			const matches: FileMatch[] = [];
			for (const path of this.paths) {
				if (path) matches.push({ path, indices: [] });
				if (matches.length === LIMIT) break;
			}
			return matches;
		}
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
		function offerGroup(group: NameGroup, tier: number, score: number) {
			offer(group.first, tier, score);
			let count = 1;
			for (const id of group.others ?? []) {
				offer(id, tier, score);
				if (++count === LIMIT) break;
			}
		}

		// Exact names are a direct lookup. Once forty prefixes win, later groups in
		// Git order cannot displace them: every prefix has the same fuzzy score.
		const exact = this.byName.get(wanted);
		if (exact) offerGroup(exact, 0, 0);
		if (!wanted.includes('/')) {
			for (const [name, group] of this.byName) {
				const last = best[LIMIT - 1];
				if (last && (last.tier === 0 || (last.tier === 1 && group.created > last.id))) break;
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
				if (!this.paths[id] || (this.masks[id] & required) !== required || named.has(id)) continue;
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

/** Reuse the cold listing rules for a literal file or directory, including type changes. */
async function listWorktreeFiles(
	source: FileSource,
	scopes: string[],
	visit: (path: string) => void
) {
	const signal = AbortSignal.timeout(FILE_SEARCH_TIMEOUT_MS);
	const deleted = new Set<string>();
	await list(
		source,
		signal,
		['diff-files', ...SAFE_DIFF, '--diff-filter=D', '--name-only', '-z', '--', ...scopes],
		(path) => deleted.add(path)
	);
	await list(
		source,
		signal,
		[
			'ls-files',
			'--cached',
			'--others',
			'--exclude-standard',
			'--deduplicate',
			'-z',
			'--',
			...scopes
		],
		(path) => {
			if (!deleted.has(path)) visit(path);
		}
	);
}

async function stagedNames(source: FileSource, commit: string) {
	const changed = new Set<string>();
	await list(
		source,
		AbortSignal.timeout(FILE_SEARCH_TIMEOUT_MS),
		[
			'diff-index',
			'--cached',
			...SAFE_DIFF,
			'--diff-filter=ADTU',
			'--name-only',
			'-z',
			commit,
			'--'
		],
		(path) => {
			if (changed.size <= MAX_FILE_CHANGES) changed.add(path);
		}
	);
	return changed.size <= MAX_FILE_CHANGES ? changed : null;
}

export async function buildFileIndex(source: FileSource): Promise<FileIndex> {
	const index = new FileIndex('worktree' in source);
	if ('revision' in source) {
		await list(
			source,
			AbortSignal.timeout(FILE_SEARCH_TIMEOUT_MS),
			['ls-tree', '-rz', '--name-only', source.revision],
			(path) => index.add(path)
		);
	} else {
		// An unborn HEAD can still have files. Without a base, an index rewrite relists them.
		const commit = await gitIn(
			source.worktree,
			'rev-parse',
			'--verify',
			headOf(source.worktree)
		).then(
			(s) => s.trim(),
			() => null
		);
		if (commit) index.staging = { commit, changed: await stagedNames(source, commit) };
		await listWorktreeFiles(source, [], (path) => index.add(path));
	}
	return index;
}

export async function refreshFileIndex(index: FileIndex, source: FileSource, changes: FileChanges) {
	if (!('worktree' in source)) return index;
	const scopes = new Set(changes.paths);
	if (changes.gitIndex) {
		if (!index.staging?.changed) return buildFileIndex(source);
		const next = await stagedNames(source, index.staging.commit);
		if (!next) return buildFileIndex(source);
		for (const path of index.staging.changed) scopes.add(path);
		for (const path of next) scopes.add(path);
		index.staging.changed = next;
	}
	if (scopes.size > MAX_FILE_CHANGES) return buildFileIndex(source);
	const paths = [...scopes];
	const visible = new Set<string>();
	// Keep long literal path arguments within the OS command-line limit.
	for (let i = 0; i < paths.length; i += 8) {
		await listWorktreeFiles(source, paths.slice(i, i + 8), (path) => visible.add(path));
	}
	return index.reconcile(paths, visible);
}
