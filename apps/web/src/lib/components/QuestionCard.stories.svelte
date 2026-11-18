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

<Story name="Waiting for delivery" args={{ delivery: 'pending' }} />
<Story name="Closed before confirmation" args={{ delivery: 'unconfirmed' }} />
