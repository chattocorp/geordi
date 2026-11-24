// Launch only the packaged worktree build, with its own desktop profile and local remotes.
import { execFileSync } from 'node:child_process';
import { existsSync, renameSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { devEnvironment } from '../../apps/desktop/scripts/dev.js';
import { seed } from '../seed-dev-data.mjs';

const repo = resolve(import.meta.dirname, '../..');
const app = join(
	repo,
	'apps/desktop/dist',
	'Geordi-darwin-' + process.arch,
	'Geordi.app/Contents/MacOS/Geordi'
);
if (!existsSync(app)) throw new Error('Build the trial app with pnpm desktop:package first.');
const env = devEnvironment(process.env, repo);
const data = join(repo, '.data/jj-desktop');
const control = join(data, 'control');
if (execFileSync('jj', ['--version'], { encoding: 'utf8' }).trim() !== 'jj 0.45.1')
	throw new Error('The native checkout helper requires jj 0.45.1 in this trial.');
execFileSync(
	join(import.meta.dirname, 'build-jj-checkout.sh'),
	[join(data, 'bin/geordi-jj-checkout')],
	{ stdio: 'inherit' }
);
seed(data);
if (!existsSync(control)) {
	const temp = mkdtempSync(join(data, 'init-'));
	try {
		const clone = join(temp, 'control');
		execFileSync(
			'jj',
			['git', 'clone', '--no-colocate', join(data, 'samples/origins/sample-services.git'), clone],
			{ stdio: 'inherit' }
		);
		// This disposable repository publishes to its own local bare remote.
		for (const [key, value] of [
			['user.name', 'Geordi Trial'],
			['user.email', 'trial@geordi.invalid']
		]) {
			execFileSync('jj', ['-R', clone, 'config', 'set', '--repo', key, value]);
		}
		renameSync(clone, control);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}
console.log('Open sample-services for jj. The other sample repositories use Git.');
process.execve(app, [app], {
	...env,
	GEORDI_DESKTOP_DEV_DIR: data,
	GEORDI_JJ_TRIAL: '1'
});
