import { describe, expect, it } from 'vitest';
import { HIGHLIGHTS, parseChangelog, SMALLER_CHANGES } from '@geordi/ui/changelog';
import changelog from '../../../../CHANGELOG.md?raw';
import config from '../../../../.sweet.config.yml?raw';

describe('parseChangelog', () => {
	it('reads releases, their sections and notes, with code and links', () => {
		const releases = parseChangelog(
			[
				'# Geordi Changelog',
				'',
				'## 1.1.0',
				'',
				'### Features',
				'',
				'- Run `npx geordi` anywhere. ([#2](https://example.com/2))',
				'- A note that goes on',
				'  over two lines.',
				'',
				'### Fixes',
				'',
				'- A [relative link](docs/x.md) stays text.',
				'',
				'## 1.0.0',
				''
			].join('\n')
		);
		expect(releases).toEqual([
			{
				version: '1.1.0',
				sections: [
					{
						title: 'Features',
						notes: [
							[
								{ text: 'Run ' },
								{ text: 'npx geordi', code: true },
								{ text: ' anywhere. (' },
								{ text: '#2', href: 'https://example.com/2' },
								{ text: ')' }
							],
							[{ text: 'A note that goes on over two lines.' }]
						]
					},
					{
						title: 'Fixes',
						notes: [[{ text: 'A ' }, { text: 'relative link' }, { text: ' stays text.' }]]
					}
				]
			},
			{ version: '1.0.0', sections: [] }
		]);
	});

	it('reads our own changelog, the latest release first', () => {
		const [latest] = parseChangelog(changelog);
		expect(latest.version).toMatch(/^\d+\.\d+\.\d+/);
		expect(latest.sections.flatMap(({ notes }) => notes).length).toBeGreaterThan(0);
	});

	it('knows the sections Sweet Release is configured to write', () => {
		expect(config).toContain(`section: ${HIGHLIGHTS}\n`);
		expect(config).toContain(`section: ${SMALLER_CHANGES}\n`);
	});
});
