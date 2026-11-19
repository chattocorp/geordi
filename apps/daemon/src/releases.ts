import { git } from './git.ts';
import { execFile } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { getReleasePlan } from '@changesets/get-release-plan';
import { getPackages } from '@manypkg/get-packages';
import { join, relative } from 'node:path';
import type { ReleasePackage, ReleasePlan } from '@geordi/protocol';
import { gitEnv, verifyLinks, type Worktree } from './worktree.ts';

/**
 * What a workspace's worktree holds for the repository's next releases (FDR-007).
 *
 * Repositories keep notes on their changes with a release tool, which turns them into
 * version bumps and changelogs when the time comes. Each tool we know has an adapter here:
 * it says whether a repository uses the tool, and reads what is pending. A new tool is a
 * new adapter in `ADAPTERS`; nothing else knows which tools there are.
 */
export type ReleaseAdapter = {
	/** What the tool is called, for programs and for people. */
	tool: string;
	name: string;
	/** The command that asks it, as people would type it: what they agree to having run. */
	command: string;
	/** Whether the repository uses it. Cheap: asked every time the worktree changes. */
	detects(worktree: Worktree, committedPaths?: string[]): boolean | Promise<boolean>;
	/** The packages and their pending notes. Rejects if the tool can't be asked. */
	read(worktree: Worktree): Promise<Read>;
};
/** What a tool knows: everything about a package but which of its notes a workspace adds. */
type Read = (Omit<ReleasePackage, 'notes'> & {
	notes: Omit<ReleasePackage['notes'][number], 'added'>[];
})[];

/** How long a tool gets to say what is pending. */
const TIMEOUT_MS = 10_000;

/**
 * Runs a release tool in a worktree and returns what it prints. Whatever git the tool
 * runs looks at the worktree the way we do: through the repository's own Git metadata,
 * never the worktree's, which is the agent's to write (`gitEnv`).
 */
const run = (worktree: Worktree, command: string, args: string[]) =>
	new Promise<string>((resolve, reject) =>
		execFile(
			command,
			args,
			{
				cwd: worktree.path,
				env: gitEnv(worktree),
				timeout: TIMEOUT_MS,
				maxBuffer: 16 * 1024 * 1024
			},
			(error, stdout, stderr) => {
				if (!error) return resolve(stdout);
				const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
				reject(
					new Error(
						missing
							? `${command} is not installed on this machine`
							: stderr.trim().split('\n')[0] || error.message
					)
				);
			}
		)
	);

const exists = (worktree: Worktree, file: string) =>
	lstatSync(join(worktree.path, file), { throwIfNoEntry: false }) !== undefined;

// --- Sweet Release (https://github.com/chattocorp/sweet-release) ------------------------------

/** One package of `sweet status --json`, the inventory it offers to automation. */
type SweetPackage = {
	path: string;
	name?: string | null;
	version: string;
	bump: string;
	nextVersion?: string | null;
	changes?: { path: string; type: string; breaking?: boolean; body?: string }[] | null;
	problems?: unknown[] | null;
};

/** What `sweet status --json` says, in our words. */
export function fromSweet(output: string): Read {
	const packages: unknown = JSON.parse(output);
	if (
		!Array.isArray(packages) ||
		!packages.every(
			(pkg) =>
				pkg &&
				typeof pkg.path === 'string' &&
				typeof pkg.version === 'string' &&
				typeof pkg.bump === 'string'
		)
	)
		throw new Error('Sweet Release returned an incomplete package plan');
	return (packages as SweetPackage[]).map((pkg) => ({
		path: pkg.path,
		name: pkg.name || null,
		version: pkg.version,
		bump: pkg.bump,
		// with nothing pending, "next" is where it is already: nothing to announce
		nextVersion: pkg.nextVersion && pkg.nextVersion !== pkg.version ? pkg.nextVersion : null,
		notes: (pkg.changes ?? []).map((change) => ({
			path: String(change.path),
			type: String(change.type),
			breaking: change.breaking === true,
			body: String(change.body ?? '').trim()
		})),
		problems: (pkg.problems ?? []).map((problem) =>
			typeof problem === 'string' ? problem : JSON.stringify(problem)
		)
	}));
}

const sweet: ReleaseAdapter = {
	tool: 'sweet-release',
	name: 'Sweet Release',
	command: 'sweet status --json',
	// its configuration, or a package's manifest, at the top or anywhere below
	detects: async (worktree, paths) =>
		paths
			? paths.some(
					(p) => p === '.sweet.config.yml' || p === '.sweet.yml' || p.endsWith('/.sweet.yml')
				)
			: exists(worktree, '.sweet.config.yml') ||
				exists(worktree, '.sweet.yml') ||
				// A fixed Git pathspec. Only package manifests are returned.
				Boolean(
					await git(
						worktree.path,
						['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*/.sweet.yml'],
						{ env: gitEnv(worktree) }
					)
				),
	read: async (worktree) => {
		const [command, ...args] = sweet.command.split(' ');
		return fromSweet(await run(worktree, command, args));
	}
};

// ----------------------------------------------------------------------------------------------

const changesets: ReleaseAdapter = {
	tool: 'changesets',
	name: 'Changesets',
	command: 'Read Changesets release plan with @changesets/get-release-plan',
	detects: (worktree, paths) =>
		paths ? paths.includes('.changeset/config.json') : exists(worktree, '.changeset/config.json'),
	async read({ path }) {
		const { packages, rootDir } = await getPackages(path);
		if (relative(path, rootDir))
			throw new Error('Changesets workspace root is outside the repository');
		const { releases, changesets: notes } = await getReleasePlan(path);
		return releases.map((release) => {
			const pkg = packages.find((p) => p.packageJson.name === release.name);
			if (!pkg) throw new Error(`Unknown Changesets package ${release.name}`);
			return {
				path: relative(path, pkg.dir) || '.',
				name: release.name,
				version: release.oldVersion ?? '',
				nextVersion: release.type === 'none' ? null : release.newVersion,
				bump: release.type,
				problems: [],
				notes: notes
					.filter((note) => release.changesets.includes(note.id))
					.map((note) => {
						const type = note.releases.find((r) => r.name === release.name)?.type ?? release.type;
						return {
							path: `.changeset/${note.id}.md`,
							type,
							breaking: type === 'major',
							body: note.summary
						};
					})
			};
		});
	}
};

const ADAPTERS: ReleaseAdapter[] = [sweet, changesets];

export async function releaseAdapter(worktree: Worktree, adapters = ADAPTERS, paths?: string[]) {
	for (const adapter of adapters) {
		if (await adapter.detects(worktree, paths)) return adapter;
	}
	return null;
}

/**
 * What the worktree holds for the repository's next releases: every package with its
 * pending notes, and which of those this workspace adds (`added`: the files that are new
 * since it branched off). `null` if the repository uses no release tool we know.
 *
 * A tool runs as the person, in a directory that is the agent's to write, because of
 * files the agent can write. So it only runs once a person has agreed to its command for
 * the repository (`approved`), like the repository's own run commands (FDR-006); until
 * then the plan only says what there is to agree to.
 */
export async function releasePlan(
	worktree: Worktree,
	/** The files this workspace has added. */
	added: () => Set<string> | Promise<Set<string>>,
	/** Whether a person has agreed to this command being run in this repository. */
	approved: (command: string) => boolean,
	adapters = ADAPTERS
): Promise<ReleasePlan | null> {
	const adapter = await releaseAdapter(worktree, adapters);
	if (!adapter) return null;
	const { tool, name, command } = adapter;
	const nothing = { tool, name, packages: [], problem: null, ask: null };
	if (!approved(command)) return { ...nothing, ask: command };
	try {
		verifyLinks(worktree); // whatever git the tool runs relies on them, as ours does
		const packages = await adapter.read(worktree);
		const mine = await added();
		return {
			...nothing,
			packages: packages.map((pkg) => ({
				...pkg,
				notes: pkg.notes.map((note) => ({ ...note, added: mine.has(note.path) }))
			}))
		};
	} catch (error) {
		return { ...nothing, problem: error instanceof Error ? error.message : String(error) };
	}
}
