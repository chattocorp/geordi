// Photographs the Open Graph card (`src/og/card.astro`) into `src/assets/og.png`.
import { dev } from 'astro';
import { chromium } from 'playwright';

// The reset job has a reserved workspace port and never starts a listener.
const server = await dev({
	logLevel: 'warn',
	server: { host: '127.0.0.1', port: Number(process.env.GEORDI_PORT ?? 0) }
});
const browser = await chromium.launch({ args: ['--disable-audio-output'] });
try {
	// Without motion, the demo stays on its last step.
	const page = await browser.newPage({
		viewport: { width: 1200, height: 630 },
		reducedMotion: 'reduce',
		colorScheme: 'dark'
	});
	await page.goto(`http://127.0.0.1:${server.address.port}/og`);
	await page.locator('[data-demo] textarea:enabled').waitFor();
	await page.evaluate(() => document.fonts.ready);
	await page.locator('#card').screenshot({ path: process.argv[2] ?? 'src/assets/og.png' });
} finally {
	await Promise.all([browser.close(), server.stop()]);
}
