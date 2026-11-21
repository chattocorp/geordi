import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
		},
		{
			// what the Run tab has to show: links (one the default), jobs that
			// keep running, one slow to come up (with a long name), and one that ends, here in
			// failure: there is no contact page
			message: 'Run it with Geordi',
			files: {
				'.geordi.yml': `default: urls.site

jobs:
  web:
    label: Static server
    command: node serve.js
  preview:
    label: Preview server that takes a few seconds to come up
    command: SERVE_DELAY=5 node serve.js
  check:
    label: Check links
    command: node check.js

urls:
  site:
    label: Site
    url: http://localhost:{web}/
  about:
    label: About page (preview)
    url: http://localhost:{preview}/about.html
`,
				'serve.js': `import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const types = { '.html': 'text/html', '.css': 'text/css' };
const port = Number(process.env.PORT ?? 8080);
const delay = Number(process.env.SERVE_DELAY ?? 0);

const server = createServer(async (request, response) => {
	const path = new URL(request.url, 'http://localhost').pathname;
	const file = join(process.cwd(), normalize(path === '/' ? '/index.html' : path));
	try {
		const body = await readFile(file);
		response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
		response.end(body);
		console.log(\`200 \${path}\`);
	} catch {
		response.writeHead(404).end('Not found');
		console.log(\`404 \${path}\`);
	}
});

if (delay) console.log(\`Starting in \${delay} seconds…\`);
setTimeout(
	() => server.listen(port, () => console.log(\`Serving on http://localhost:\${port}/\`)),
	delay * 1000
);
`,
				'check.js': `import { existsSync, readFileSync, readdirSync } from 'node:fs';

let broken = 0;
for (const page of readdirSync('.').filter((file) => file.endsWith('.html'))) {
	for (const [, href] of readFileSync(page, 'utf8').matchAll(/(?:href|src)="([^":#]+)"/g)) {
		if (existsSync(href)) continue;
		console.error(\`\${page}: \${href} is missing\`);
		broken++;
	}
}
console.log(broken ? \`\${broken} broken link(s)\` : 'Every link leads somewhere.');
process.exit(broken ? 1 : 0);
`,
				'index.html':
					'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<title>Sample site</title>\n\t\t<link rel="stylesheet" href="style.css" />\n\t</head>\n\t<body>\n\t\t<h1>Hello</h1>\n\t\t<p>This is a sample site.</p>\n\t\t<p><a href="about.html">About</a> · <a href="contact.html">Contact</a></p>\n\t</body>\n</html>\n'
			}
		}
	],
	'sample-cli': [
		{
			message: 'Start a small command-line tool',
			files: {
				'README.md': '# Sample CLI\n\nGreets whoever it is told to: `node greet.js Ada`.\n',
				'package.json':
					'{\n\t"name": "sample-cli",\n\t"version": "0.1.0",\n\t"private": true,\n\t"type": "module",\n\t"scripts": {\n\t\t"test": "node --test"\n\t}\n}\n',
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
		},
		{
			message: 'Release with Sweet Release',
			files: {
				'.sweet.config.yml':
					'types:\n  fix:\n    bump: patch\n    section: Fixes\n  feature:\n    bump: minor\n    section: Features\n  chore:\n    bump: none\n',
				'.sweet.yml':
					'name: Sample CLI\nversion: 0.1.0\nversion-files:\n  - path: package.json\n    format: json\n    key: version\n'
			}
		},
		{
			// a single job, which ends: Run runs it
			message: 'Run the tests with Geordi',
			files: {
				'.geordi.yml': 'jobs:\n  test:\n    label: Tests\n    command: node --test\n'
			}
		}
	]
};

/**
 * Workspaces with work under way, so that a fresh development installation has changes and
 * release notes to show: each in a sample repository, with files written but not committed.
 */
const WORKSPACES = {
	'sample-site': [
		{
			title: 'Soften the colours',
			files: {
				'style.css':
					'body {\n\tfont-family: system-ui, sans-serif;\n\tmargin: 4rem auto;\n\tmax-width: 40rem;\n\tcolor: #333;\n\tbackground: #fdfcf8;\n}\n'
			}
		}
	],
	'sample-cli': [
		{
			title: 'Say goodbye too',
			files: {
				'greet.js':
					"export function greet(name = 'world') {\n\treturn `Hello, ${name}!`;\n}\n\nexport function farewell(name = 'world') {\n\treturn `Goodbye, ${name}!`;\n}\n\nif (import.meta.main) console.log(greet(process.argv[2]));\n",
				'farewell.test.js':
					"import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { farewell } from './greet.js';\n\ntest('says goodbye to the world by default', () => {\n\tassert.equal(farewell(), 'Goodbye, world!');\n});\n",
				'.sweet/sample-gentle-farewell.md':
					'---\ntype: feature\n---\n\nYou can now say goodbye as well as hello.\n'
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

function writeFiles(dir, files) {
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), content);
	}
}

/**
 * Gives a development data directory the sample repositories it has not had yet: each with
 * a bare repository as its `origin`, so that agents can push. A sample is made and
 * registered once, so one removed in the app stays removed. Some come with a workspace
 * whose work is under way (`WORKSPACES`).
 */
export function seed(data) {
	const samples = join(data, 'samples');
	const missing = Object.keys(SAMPLES).filter((name) => !existsSync(join(samples, name)));
	if (missing.length === 0) return;

	mkdirSync(data, { recursive: true });
	const store = new EventStore(join(data, 'events.db'));
	const repos = createRepos(store);
	for (const name of missing) {
		const repo = join(samples, name);
		const origin = join(samples, 'origins', `${name}.git`);
		mkdirSync(origin, { recursive: true });
		git(origin, 'init', '--bare');
		mkdirSync(repo, { recursive: true });
		git(repo, 'init');
		for (const { message, files } of SAMPLES[name]) {
			writeFiles(repo, files);
			git(repo, 'add', '--all');
			git(repo, 'commit', '--message', message);
		}
		git(repo, 'remote', 'add', 'origin', origin);
		git(repo, 'push', '--set-upstream', 'origin', 'main');
		const { id: repoId } = repos.register(repo, 'seed');
		for (const { title, files } of WORKSPACES[name] ?? []) {
			// where and on which branch the daemon expects the worktree (`describe` in worktree.ts)
			const id = randomUUID();
			const short = id.slice(0, 8);
			const worktree = join(data, 'worktrees', repoId, short);
			mkdirSync(dirname(worktree), { recursive: true });
			git(repo, 'worktree', 'add', '-b', `geordi/${short}`, worktree, 'main');
			writeFiles(worktree, files);
			const stream = `workspace:${id}`;
			store.append(
				[
					{
						type: 'workspace.created',
						stream,
						data: { id, repoId, worktreeParent: repoId, title, agent: 'claude' }
					},
					// what the daemon says once it has made a worktree
					{
						type: 'workspace.output',
						stream,
						data: { id, event: { kind: 'worktree', path: worktree, branch: `geordi/${short}` } }
					}
				],
				{ actor: 'seed' }
			);
		}
		console.log(`Seeded the sample repository ${name}.`);
	}
}
