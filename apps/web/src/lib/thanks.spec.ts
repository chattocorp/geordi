import { describe, expect, it } from 'vitest';
import { says, spoken, THANKS } from '@geordi/ui/thanks';

describe('thanks', () => {
	it('has fifty different ones for each action that thanks', () => {
		for (const thanks of Object.values(THANKS)) {
			expect(thanks).toHaveLength(50);
			expect(new Set(thanks).size).toBe(50);
		}
	});

	it('opens the prompt with one of them', () => {
		expect(spoken('commit', 'Commit.', () => 0)).toBe(`${THANKS.commit![0]} Commit.`);
		expect(spoken('commit', 'Commit.', () => 0.999)).toBe(`${THANKS.commit!.at(-1)} Commit.`);
	});

	it('leaves prompts without thanks as they are', () => {
		expect(spoken('merge-upstream', 'Merge.')).toBe('Merge.');
	});

	it('recognises the prompt whichever thanks it opened with', () => {
		const prompt = 'Commit the changes.';
		expect(says(spoken('commit', prompt), prompt)).toBe(true);
		expect(says(prompt, prompt)).toBe(true);
		expect(says('Please do not. Commit the changes, later.', prompt)).toBe(false);
	});
});
