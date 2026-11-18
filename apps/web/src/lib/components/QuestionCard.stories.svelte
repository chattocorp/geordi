<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import QuestionCard from './QuestionCard.svelte';

	const { Story } = defineMeta({
		title: 'Workspace/Question card',
		component: QuestionCard,
		args: {
			questions: [{ question: 'Which database should we use?', options: [], multiSelect: false }],
			answers: ['SQLite'],
			open: false,
			onanswer: () => {}
		}
	});
</script>

<Story
	name="Open"
	args={{
		open: true,
		answers: null,
		questions: [
			{
				header: 'Apple team',
				question: 'Does the Developer ID identity belong to the intended publishing team?',
				options: [
					{
						label: 'The teams match (Recommended)',
						description: 'Continue with the existing identity.'
					},
					{
						label: 'Different team',
						description: 'Set up an identity for the intended publisher.'
					},
					{ label: 'Unable to verify', description: 'Get help finding the team.' }
				],
				multiSelect: false
			},
			{
				header: 'Platforms',
				question: 'Which platforms should we build for?',
				options: [{ label: 'macOS' }, { label: 'Linux' }, { label: 'Windows' }],
				multiSelect: true,
				optional: true
			},
			{ question: 'Anything else?', options: [], multiSelect: false, optional: true }
		]
	}}
/>
<Story name="Answered" args={{ answers: ['SQLite, for now.\nPostgreSQL later.'] }} />
<Story name="Waiting for delivery" args={{ delivery: 'pending' }} />
<Story name="Closed before confirmation" args={{ delivery: 'unconfirmed' }} />
<Story
	name="Optional note left out"
	args={{
		questions: [
			{ question: 'Which database should we use?', options: [], multiSelect: false },
			{ question: 'Additional answer or note', options: [], multiSelect: false, optional: true }
		],
		answers: ['SQLite', '']
	}}
/>
