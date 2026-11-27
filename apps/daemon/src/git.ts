import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const CHECKOUT_TIMEOUT = 120_000;

export async function git(
	cwd: string,
	args: string[],
	{
		env = process.env,
		timeout = 10_000,
		encoding = 'utf8',
		input
	}: { env?: NodeJS.ProcessEnv; timeout?: number; encoding?: BufferEncoding; input?: string } = {}
): Promise<string> {
	try {
		const command = run('git', args, {
			cwd,
			env,
			timeout,
			killSignal: 'SIGKILL',
			encoding,
			maxBuffer: 64 * 1024 * 1024
		});
		if (input !== undefined) {
			command.child.stdin?.on('error', () => {}); // an early Git exit is reported below
			command.child.stdin?.end(input);
		}
		return (await command).stdout;
	} catch (error) {
		if (
			error instanceof Error &&
			'killed' in error &&
			error.killed &&
			'signal' in error &&
			error.signal === 'SIGKILL'
		)
			throw new Error(`git ${args.join(' ')} timed out after ${timeout} ms`, { cause: error });
		throw error;
	}
}

export async function quietGit(cwd: string, ...args: string[]) {
	try {
		return (await git(cwd, args)).trim();
	} catch (error) {
		if (error instanceof Error && 'code' in error && typeof error.code === 'number') return null;
		throw error;
	}
}
