<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, within } from 'storybook/test';
	import PortConflictDialog from './PortConflictDialog.svelte';

	const { Story } = defineMeta({ title: 'Geordi/Port conflict', component: PortConflictDialog });
	const conflict = {
		port: 20243,
		job: 'Web server',
		listener: { name: 'node', pid: 95058 },
		confirmation: 'observed'
	};
</script>

<Story
	name="Identified listener"
	args={{ conflict, cancel: fn(), retry: fn() }}
	play={async ({ canvasElement, args, userEvent }) => {
		const dialog = within(canvasElement).getByRole('dialog');
		await userEvent.click(within(dialog).getByRole('button', { name: 'Stop process and retry' }));
		await expect(args.retry).toHaveBeenCalledOnce();
	}}
/>
<Story
	name="Unknown listener"
	args={{
		conflict: { ...conflict, listener: null, confirmation: undefined },
		cancel: fn(),
		retry: fn()
	}}
	play={async ({ canvasElement, args, userEvent }) => {
		const dialog = within(canvasElement).getByRole('dialog');
		await expect(within(dialog).queryByRole('button', { name: /Stop process/ })).toBeNull();
		await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		await expect(args.retry).not.toHaveBeenCalled();
		await expect(args.cancel).toHaveBeenCalled();
	}}
/>
