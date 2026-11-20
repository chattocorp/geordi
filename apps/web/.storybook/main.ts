import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	staticDirs: [{ from: '../../../packages/ui/src/assets', to: '/images' }],
	stories: ['../src/**/*.stories.svelte'],
	addons: [
		'@storybook/addon-svelte-csf',
		'@storybook/addon-vitest',
		'@storybook/addon-a11y',
		'@storybook/addon-docs'
	],
	framework: '@storybook/sveltekit'
};

export default config;
