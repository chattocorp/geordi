import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EventStore } from '../apps/web/src/lib/server/events/store.ts';
import { createRepos } from '../apps/web/src/lib/server/repos.ts';

/**
 * Sample repositories for development data: small, but real enough to give an agent
 * something to do. Each is a list of commits, each commit a message and the files it writes.
 */
const SAMPLES = {
	'sample-site': [
		{
			message: 'Start a small static site',
			files: {
				'README.md': '# Sample site\n\nA small static site. Open `index.html` in a browser.\n',
				'index.html':
					'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<title>Sample site</title>\n\t\t<link rel="stylesheet" href="style.css" />\n\t</head>\n\t<body>\n\t\t<h1>Hello</h1>\n\t\t<p>This is a sample site.</p>\n\t</body>\n</html>\n',
				'style.css':
					'body {\n\tfont-family: system-ui, sans-serif;\n\tmargin: 4rem auto;\n\tmax-width: 40rem;\n}\n'
			}
		},
		{
			message: 'Add an about page',
			files: {
				'about.html':
					'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<title>About</title>\n\t\t<link rel="stylesheet" href="style.css" />\n\t</head>\n\t<body>\n\t\t<h1>About</h1>\n\t\t<p><a href="index.html">Back home</a></p>\n\t</body>\n</html>\n'
			}
		}
	],
	'sample-cli': [
		{
			message: 'Start a small command-line tool',
			files: {
				'README.md': '# Sample CLI\n\nGreets whoever it is told to: `node greet.js Ada`.\n',
				'package.json':
					'{\n\t"name": "sample-cli",\n\t"private": true,\n\t"type": "module",\n\t"scripts": {\n\t\t"test": "node --test"\n\t}\n}\n',
				'greet.js':
					"export function greet(name = 'world') {\n\treturn `Hello, ${name}!`;\n}\n\nif (import.meta.main) console.log(greet(process.argv[2]));\n"
			}
		},
		{
			message: 'Test the greeting',
			files: {
				'greet.test.js':
					"import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { greet } from './greet.js';\n\ntest('greets the world by default', () => {\n\tassert.equal(greet(), 'Hello, world!');\n});\n"
			}
		}
	]
};

// Commits must not depend on the person's Git configuration (identity, signing, hooks).
const GIT_ENV = {
	...process.env,
	GIT_AUTHOR_NAME: 'Geordi',
	GIT_AUTHOR_EMAIL: 'samples@geordi.invalid',
	GIT_COMMITTER_NAME: 'Geordi',
	GIT_COMMITTER_EMAIL: 'samples@geordi.invalid'
};

function git(cwd, ...args) {
	execFileSync(
		'git',
		[
			'-c',
			'commit.gpgsign=false',
			'-c',
			'core.hooksPath=/dev/null',
			'-c',
			'init.defaultBranch=main',
			...args
		],
		{ cwd, env: GIT_ENV, stdio: 'ignore' }
	);
}

/**
 * Gives a development data directory the sample repositories it has not had yet: each with
 * a bare repository as its `origin`, so that agents can push. A sample is made and
 * registered once, so one removed in the app stays removed.
 */
export function seed(data) {
	const samples = join(data, 'samples');
	const missing = Object.keys(SAMPLES).filter((name) => !existsSync(join(samples, name)));
	if (missing.length === 0) return;

	mkdirSync(data, { recursive: true });
	const repos = createRepos(new EventStore(join(data, 'events.db')));
	for (const name of missing) {
		const repo = join(samples, name);
		const origin = join(samples, 'origins', `${name}.git`);
		mkdirSync(origin, { recursive: true });
		git(origin, 'init', '--bare');
		mkdirSync(repo, { recursive: true });
		git(repo, 'init');
		for (const { message, files } of SAMPLES[name]) {
			for (const [path, content] of Object.entries(files)) {
				mkdirSync(dirname(join(repo, path)), { recursive: true });
				writeFileSync(join(repo, path), content);
			}
			git(repo, 'add', '--all');
			git(repo, 'commit', '--message', message);
		}
		git(repo, 'remote', 'add', 'origin', origin);
		git(repo, 'push', '--set-upstream', 'origin', 'main');
		repos.register(repo, 'seed');
		console.log(`Seeded the sample repository ${name}.`);
	}
}
