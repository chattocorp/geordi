import { describe, expect, it } from 'vitest';
import { bySection } from '@geordi/ui/sections';

const files = (...paths: string[]) => paths.map((path) => ({ path }));
const show = (found: ReturnType<typeof bySection<{ path: string }>>) =>
	found.map(({ title, files }) => [title, files.map((file) => file.path)]);

describe('bySection', () => {
	const sections = [
		{ path: 'apps/web', title: 'Forge' },
		{ path: 'docs', title: 'Docs' },
		{ path: 'apps/web/src/lib/server', title: 'Forge server' }
	];

	it('groups files by section, in their order, with the rest last', () => {
		expect(
			show(
				bySection(
					files(
						'README.md',
						'docs/adr/ADR-001.md',
						'apps/web/src/app.ts',
						'apps/web/src/lib/server/app.ts',
						'apps/website/index.astro'
					),
					sections
				)
			)
		).toEqual([
			['Forge', ['apps/web/src/app.ts']],
			['Docs', ['docs/adr/ADR-001.md']],
			['Forge server', ['apps/web/src/lib/server/app.ts']],
			// a section's path is a directory, not the start of a name
			['Other', ['README.md', 'apps/website/index.astro']]
		]);
	});

	it('leaves out sections without files', () => {
		expect(show(bySection(files('docs/a.md'), sections))).toEqual([['Docs', ['docs/a.md']]]);
		expect(show(bySection(files('a.md'), []))).toEqual([['Other', ['a.md']]]);
		expect(bySection([], sections)).toEqual([]);
	});
});
