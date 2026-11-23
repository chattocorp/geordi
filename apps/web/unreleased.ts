import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/** Render pending Sweet notes in the same section order as the published changelog. */
export function unreleased(root: string): string {
	const read = (path: string) => readFileSync(join(root, path), 'utf8');
	const { types } = parse(read('.sweet.config.yml')) as {
		types: Record<string, { section?: string }>;
	};
	const sections = new Map<string, string[]>();
	for (const { section } of Object.values(types)) {
		if (section) sections.set(section, []);
	}

	for (const file of globSync('.sweet/*.md', { cwd: root }).sort()) {
		const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(read(file));
		if (!match) throw new Error(`Invalid release note: ${file}`);
		const { type, breaking } = parse(match[1]);
		const section = types[type]?.section;
		const body = match[2].trim().replace(/\s*\n\s*/g, ' ');
		if (section && body) {
			sections.get(section)!.push(`- ${breaking ? '⚠️ **BREAKING CHANGE:** ' : ''}${body}`);
		}
	}

	const groups = [...sections].filter(([, notes]) => notes.length);
	return groups.length
		? [
				'## Unreleased',
				...groups.map(([title, notes]) => `### ${title}\n\n${notes.join('\n')}`)
			].join('\n\n') + '\n\n'
		: '';
}
