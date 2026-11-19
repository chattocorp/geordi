import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// A static site: `pnpm --filter @geordi/website build` writes it to `dist/`.
export default defineConfig({
	site: 'https://geordi.run',
	integrations: [
		svelte(),
		{
			// The Open Graph card is photographed from the dev server (`scripts/og.mjs`).
			name: 'og-card',
			hooks: {
				'astro:config:setup': ({ command, injectRoute }) => {
					if (command === 'dev') injectRoute({ pattern: '/og', entrypoint: './src/og/card.astro' });
				}
			}
		}
	],
	devToolbar: { enabled: false },
	vite: { plugins: [tailwindcss()] }
});
