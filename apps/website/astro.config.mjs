import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// A static site: `pnpm --filter @geordi/website build` writes it to `dist/`.
export default defineConfig({
	devToolbar: { enabled: false },
	vite: { plugins: [tailwindcss()] }
});
