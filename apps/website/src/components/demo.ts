import type { ToolEntry } from '@geordi/ui/tools';
import type { WorkspaceStanding } from '@geordi/ui/actions';
import type { Changes, Task } from '@geordi/protocol';

export const message =
	'After signing in, people land on the home page instead of the page they came for. Send them back there.';

export const tools = [
	{
		step: 2,
		id: 'read-login',
		name: 'Read',
		input: JSON.stringify({ file_path: 'src/routes/login/+page.server.ts' }),
		output: "await signIn(request);\nredirect(303, '/');"
	},
	{
		step: 3,
		id: 'edit-auth',
		name: 'Edit',
		input: JSON.stringify({ file_path: 'src/lib/server/auth.ts' }),
		output: 'Updated src/lib/server/auth.ts'
	},
	{
		step: 4,
		id: 'edit-login',
		name: 'Edit',
		input: JSON.stringify({ file_path: 'src/routes/login/+page.server.ts' }),
		output: 'Updated the sign-in redirect.'
	},
	{
		step: 5,
		id: 'write-test',
		name: 'Write',
		input: JSON.stringify({ file_path: 'src/lib/server/auth.spec.ts' }),
		output: 'Added redirect tests.'
	},
	{
		step: 6,
		id: 'test',
		name: 'Bash',
		input: JSON.stringify({ command: 'pnpm test auth' }),
		output: '2 tests passed.'
	}
] satisfies (Omit<ToolEntry, 'isError'> & { step: number })[];

/** The other workspaces in the sidebar, and how each stands. */
export const others = [
	{
		title: 'Dark mode for emails',
		standing: { icon: 'icon-[lucide--circle-check]', tone: 'ok', label: 'Ready to merge' }
	},
	{
		title: 'Upgrade to Vite 8',
		standing: { icon: 'icon-[lucide--circle-x]', tone: 'danger', label: 'Checks failing' }
	},
	{
		title: 'Rate-limit invitations',
		standing: { icon: 'icon-[lucide--git-merge]', tone: 'merged', label: 'Merged' }
	}
] satisfies { title: string; standing: WorkspaceStanding }[];

export const loginDiff = [
	[' ', 'export const actions = {'],
	[' ', '  default: async ({ request, url }) => {'],
	[' ', '    await signIn(request);'],
	['-', "    redirect(303, '/');"],
	['+', "    const to = url.searchParams.get('returnTo');"],
	['+', "    redirect(303, safePath(to) ?? '/');"],
	[' ', '  }'],
	[' ', '};']
];

const sampleFiles = [
	{
		step: 3,
		path: 'src/lib/server/auth.ts',
		status: 'modified',
		lines: [
			[' ', 'export function safePath(value: string | null) {'],
			['-', "  return value === '/account' ? value : null;"],
			['+', "  const destinations = new Set(['/account', '/settings']);"],
			['+', '  return value && destinations.has(value) ? value : null;'],
			[' ', '}']
		]
	},
	{
		step: 4,
		path: 'src/routes/login/+page.server.ts',
		status: 'modified',
		lines: loginDiff
	},
	{
		step: 5,
		path: 'src/lib/server/auth.spec.ts',
		status: 'added',
		lines: [
			['+', "it('keeps redirects on this site', () => {"],
			['+', "  expect(safePath('/account')).toBe('/account');"],
			['+', "  expect(safePath('//other.test')).toBeNull();"],
			['+', '});']
		]
	}
] satisfies (Pick<Changes['files'][number], 'path' | 'status'> & {
	step: number;
	lines: string[][];
})[];

// Keep the file counts, static preview and interactive diff in sync.
export const files = sampleFiles.map(({ step, path, status, lines }) => {
	const contentsWithout = (sign: string) =>
		lines
			.filter(([prefix]) => prefix !== sign)
			.map(([, text]) => text + '\n')
			.join('');
	return {
		step,
		path,
		status,
		old: status === 'added' ? null : contentsWithout('+'),
		new: contentsWithout('-'),
		added: lines.filter(([sign]) => sign === '+').length,
		removed: lines.filter(([sign]) => sign === '-').length
	};
});

/** What the workspace's `.geordi.yml` says it runs, for the Tasks tab. */
export const tasks: Task[] = [
	{
		name: 'db',
		label: 'Database',
		command: 'docker compose up db',
		approved: true,
		ports: [{ name: 'postgres', port: 20101 }],
		links: [],
		needs: [],
		default: false
	},
	{
		name: 'web',
		label: 'Dev server',
		command: 'pnpm dev --port $PORT',
		approved: true,
		ports: [{ name: 'http', port: 20102 }],
		links: [{ name: 'app', label: 'App', href: 'http://localhost:20102/' }],
		needs: ['db'],
		default: true
	}
];

export const hold = [400, 1000, 900, 1200, 1300, 1000, 1700, 3600, 3200, 3600, 9000];
export const last = hold.length - 1;
