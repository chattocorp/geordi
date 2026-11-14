import type { Preview } from '@storybook/sveltekit';
import '../src/routes/layout.css';

const preview: Preview = {
	// Every story can be viewed in both colour modes, from the toolbar.
	globalTypes: {
		theme: {
			description: 'Colour mode',
			toolbar: {
				icon: 'mirror',
				items: [
					{ value: 'light', title: 'Light' },
					{ value: 'dark', title: 'Dark' }
				],
				dynamicTitle: true
			}
		}
	},
	initialGlobals: { theme: 'light' },
	decorators: [
		(story, { globals }) => {
			document.documentElement.classList.toggle('dark', globals.theme === 'dark');
			return story();
		}
	],
	parameters: {
		// The page background comes from our own tokens.
		backgrounds: { disable: true },
		// 'todo' shows accessibility violations in the test UI without failing tests.
		a11y: { test: 'todo' }
	}
};

export default preview;
