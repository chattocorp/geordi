import { after, before, test } from 'node:test';
import { preview } from 'astro';
import { chromium, expect } from 'playwright/test';

let server;
let browser;
before(async () => {
	// The reset job has a reserved workspace port and never starts a listener.
	server = await preview({
		server: { host: '127.0.0.1', port: Number(process.env.GEORDI_PORT_RESET ?? 0) },
		vite: { preview: { strictPort: true } }
	});
	browser = await chromium.launch();
});

after(async () => {
	await Promise.all([browser?.close(), server?.stop()]);
});

async function openDemo(t, javaScriptEnabled) {
	const page = await browser.newPage({
		javaScriptEnabled,
		reducedMotion: 'reduce',
		viewport: { width: 1440, height: 1000 }
	});
	t.after(() => page.close());
	await page.goto(`http://127.0.0.1:${server.port}/`);
	const demo = page.getByRole('figure', { name: /A Geordi workspace/ });
	await demo.scrollIntoViewIfNeeded();
	return demo;
}

test('open changed files, revisit a diff, and inspect pull request #412', async (t) => {
	const demo = await openDemo(t, true);
	// The island hydrates when it enters the viewport. The composer becomes enabled then.
	await expect(demo.getByRole('textbox')).toBeEnabled();
	const changes = demo.getByRole('region', { name: 'Changes' });
	const auth = demo.getByRole('tabpanel', { name: 'auth.ts', exact: true });
	const spec = demo.getByRole('tabpanel', { name: 'auth.spec.ts', exact: true });
	const authLine = auth.getByText('return value && destinations.has(value) ? value : null;', {
		exact: true
	});

	await changes.getByRole('button', { name: /auth\.ts/ }).click();
	await expect(authLine).toBeVisible();
	await changes.getByRole('button', { name: /auth\.spec\.ts/ }).click();
	await expect(
		spec.getByText("expect(safePath('//other.test')).toBeNull();", { exact: true })
	).toBeVisible();
	await demo.getByRole('tab', { name: 'auth.ts', exact: true }).click();
	await expect(authLine).toBeVisible();
	await expect(spec).toBeHidden();

	await demo.getByRole('button', { name: '#412', exact: true }).click();
	await expect(demo.getByRole('tab', { name: /#412/ })).toHaveAttribute('aria-selected', 'true');
	const pull = demo.getByRole('tabpanel', { name: /#412/ });
	await expect(pull.getByRole('heading', { name: 'Return people after sign-in' })).toBeVisible();
	await pull.getByRole('button', { name: /Checks/ }).click();
	await expect(pull.getByText('Sign-in redirect tests')).toBeVisible();
});

test('the conversation, changed files, and diff are readable without JavaScript', async (t) => {
	const demo = await openDemo(t, false);
	const chat = demo.getByRole('tabpanel', { name: 'Claude' });
	await expect(chat.getByText(/After signing in, people land on the home page/)).toBeVisible();
	await expect(chat.getByText(/People now return to the page they asked for/)).toBeVisible();
	await expect(
		demo.getByRole('region', { name: 'Changes' }).getByRole('button', { name: /auth\.ts/ })
	).toBeVisible();
	const diff = demo.getByRole('tabpanel', { name: '+page.server.ts' });
	await expect(diff.getByText("redirect(303, safePath(to) ?? '/');")).toBeVisible();
});

test('a link to the site is shown with a picture', async (t) => {
	const page = await browser.newPage();
	t.after(() => page.close());
	await page.goto(`http://127.0.0.1:${server.port}/`);
	const meta = (property) => page.locator(`meta[property="og:${property}"]`);
	await expect(meta('url')).toHaveAttribute('content', 'https://geordi.run/');
	await expect(meta('image:width')).toHaveAttribute('content', '2400');
	await expect(meta('image:height')).toHaveAttribute('content', '1260');
	// The address is the public one; the file is asked of the server under test.
	const image = new URL(await meta('image').getAttribute('content'));
	expect(image.origin).toBe('https://geordi.run');
	const response = await page.request.get(`http://127.0.0.1:${server.port}${image.pathname}`);
	expect(response.headers()['content-type']).toBe('image/png');
});
