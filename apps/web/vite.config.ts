import { resolve } from 'node:path';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { unreleased } from './unreleased.ts';

export default defineConfig({
	define: {
		'import.meta.env.GEORDI_UNRELEASED_NOTES': JSON.stringify(
			process.env.GEORDI_RELEASE_BUILD === '1'
				? ''
				: unreleased(resolve(import.meta.dirname, '../..'))
		)
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},
			adapter: adapter(),
			// Agent output is untrusted: never load images from other origins (data exfiltration).
			csp: { directives: { 'img-src': ['self', 'data:'] } },
			experimental: { remoteFunctions: true }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				// Every story is also a test: it must render (in a real browser) without errors.
				extends: true,
				// Prebundle lazy imports so a cold cache cannot reload stories during a test.
				optimizeDeps: {
					include: [
						'@pierre/diffs',
						'@xterm/xterm',
						'@xterm/addon-fit',
						'@xterm/addon-web-links',
						'pele/lazy'
					]
				},
				plugins: [storybookTest({ configDir: `${import.meta.dirname}/.storybook` })],
				test: {
					name: 'storybook',
					// Stories render; they don't need to assert anything themselves.
					expect: { requireAssertions: false },
					browser: {
						enabled: true,
						headless: true,
						// Use Chromium's virtual output so macOS does not prompt for the microphone.
						provider: playwright({ launchOptions: { args: ['--disable-audio-output'] } }),
						instances: [{ browser: 'chromium' }]
					}
				}
			}
		]
	}
});
