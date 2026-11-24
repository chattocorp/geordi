<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, within } from 'storybook/test';
	import ForwardedQuestions from './ForwardedQuestions.svelte';
	const { Story } = defineMeta({
		title: 'Geordi/Forwarded questions',
		component: ForwardedQuestions
	});
	const onanswer = fn();
</script>

<Story
	name="Two children"
	args={{
		requests: [
			{
				workspaceId: 'db',
				title: 'Database tests',
				id: 'q',
				questions: [
					{
						question: 'Which database should the tests use?',
						options: [{ label: 'SQLite' }, { label: 'Postgres' }],
						multiSelect: false
					}
				]
			},
			{
				workspaceId: 'web',
				title: 'Browser tests',
				id: 'q',
				questions: [{ question: 'Which browser should we cover?', options: [], multiSelect: false }]
			}
		],
		onanswer
	}}
	play={async ({ canvas }) => {
		await userEvent.click(canvas.getByText('Database tests'));
		const sqlite = canvas.getByRole('button', { name: 'SQLite' });
		await userEvent.click(sqlite);
		await userEvent.click(within(sqlite.closest('form')!).getByRole('button', { name: 'Answer' }));
		await expect(onanswer).toHaveBeenCalledWith('db', 'q', ['SQLite']);
	}}
/>
