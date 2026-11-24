<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import UpcomingRelease from './UpcomingRelease.svelte';
	const { Story } = defineMeta({ title: 'Geordi/Upcoming release', component: UpcomingRelease });
	const plan = { tool: 'changesets', name: 'Changesets', packages: [], problem: null, ask: null };
	const empty = {
		name: 'sample-cli',
		online: true,
		release: { branch: 'main', problem: null, plan }
	};
	const pkg = {
		path: '.',
		name: 'sample-cli',
		version: '1.4.2',
		nextVersion: '1.5.0',
		bump: 'minor',
		problems: [],
		notes: [
			{
				type: 'minor',
				path: '.changeset/output.md',
				added: false,
				breaking: false,
				body: 'Export results as Markdown.'
			}
		]
	};
	const onrefresh = async () => {};
</script>

<Story
	name="Pending"
	args={{
		state: { ...empty, release: { ...empty.release, plan: { ...plan, packages: [pkg] } } },
		onrefresh
	}}
/>
<Story name="Nothing pending" args={{ state: empty, onrefresh }} />
