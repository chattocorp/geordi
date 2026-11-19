import { describe, expect, it } from 'vitest';
import { fitPath, initial } from '@geordi/ui/paths';

const show = ({ dirs, name }: { dirs: string[]; name: string }) => [...dirs, name].join('/');

describe('initial', () => {
	it('keeps the first letter, and what wraps the name', () => {
		expect(initial('components')).toBe('c');
		expect(initial('[serverId]')).toBe('[s]');
		expect(initial('[[optional]]')).toBe('[[o]]');
		expect(initial('(app)')).toBe('(a)');
		expect(initial('.github')).toBe('.g');
		expect(initial('über')).toBe('ü');
	});

	it('leaves names that would not get shorter', () => {
		expect(initial('a')).toBe('a');
		expect(initial('[a]')).toBe('[a]');
		expect(initial('...')).toBe('...');
	});
});

describe('fitPath', () => {
	const path = 'apps/frontend/src/lib/MessageView.svelte';

	it('leaves a path that fits', () => {
		expect(show(fitPath(path, path.length))).toBe(path);
		expect(fitPath('README.md', 3)).toEqual({ dirs: [], name: 'README.md' });
	});

	it('shortens directories to their first letters, the outermost first', () => {
		expect(show(fitPath(path, path.length - 1))).toBe('a/frontend/src/lib/MessageView.svelte');
		expect(show(fitPath(path, 28))).toBe('a/f/s/lib/MessageView.svelte');
		expect(show(fitPath(path, 26))).toBe('a/f/s/l/MessageView.svelte');
	});

	it('then drops them for an ellipsis, also from the outside', () => {
		expect(show(fitPath(path, 25))).toBe('…/s/l/MessageView.svelte');
		expect(show(fitPath(path, 22))).toBe('…/l/MessageView.svelte');
		expect(show(fitPath(path, 20))).toBe('…/MessageView.svelte');
	});

	it('leaves only the name when not even that fits', () => {
		expect(fitPath(path, 19)).toEqual({ dirs: [], name: 'MessageView.svelte' });
		expect(fitPath(path, 0)).toEqual({ dirs: [], name: 'MessageView.svelte' });
	});
});
