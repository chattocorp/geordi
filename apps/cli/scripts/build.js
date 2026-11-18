import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { stageServices } from '@geordi/launch/stage.js';

/**
 * Stages the `geordi` npm package in `stage/`, to publish from there (`npm publish stage`)
 * or run (`node stage/geordi.js`). It holds the services as the desktop app has them, and
 * the command that starts them; npm installs the one native dependency.
 */

const root = join(import.meta.dirname, '..');
const repo = join(root, '../..');
const stage = join(root, 'stage');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const daemon = JSON.parse(readFileSync(join(repo, 'apps/daemon/package.json'), 'utf8'));
const pty = '@lydell/node-pty';

rmSync(stage, { recursive: true, force: true });
await stageServices(stage);
await build({
	entryPoints: [join(root, 'src/geordi.js')],
	outfile: join(stage, 'geordi.js'),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node24',
	logLevel: 'warning'
});
writeFileSync(
	join(stage, 'package.json'),
	JSON.stringify(
		{
			name: 'geordi',
			version,
			description: 'A self-hostable code forge and agent orchestrator.',
			homepage: 'https://github.com/chattocorp/geordi',
			repository: { type: 'git', url: 'git+https://github.com/chattocorp/geordi.git' },
			type: 'module',
			bin: { geordi: 'geordi.js' },
			engines: { node: '>=24' },
			dependencies: { [pty]: daemon.dependencies[pty] }
		},
		null,
		'\t'
	) + '\n'
);
cpSync(join(root, 'README.md'), join(stage, 'README.md'));
console.log(`staged geordi ${version} in ${stage}`);
