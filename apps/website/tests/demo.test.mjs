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

async function openDemo(t, javaScriptEnabled, width = 1440) {
	const page = await browser.newPage({
		javaScriptEnabled,
		reducedMotion: 'reduce',
		viewport: { width, height: 1000 }
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

test('phone title bars contain the pull request and next action', async (t) => {
	const demo = await openDemo(t, true, 320);
	await expect(demo.getByRole('textbox')).toBeEnabled();
	const header = demo.locator('header');
	const bounds = await header.boundingBox();
	for (const name of ['#412', 'Archive']) {
		const box = await header.getByRole('button', { name, exact: true }).boundingBox();
		expect(box.y).toBeGreaterThanOrEqual(bounds.y);
		expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
		expect(box.x).toBeGreaterThanOrEqual(bounds.x);
		expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
	}
	await header.getByRole('button', { name: '#412' }).click();
	await expect(demo.getByRole('tab', { name: /#412/ })).toHaveAttribute('aria-selected', 'true');
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
	await expect(meta('description')).toHaveAttribute('content', /^.{1,125}$/);
	await expect(meta('image:width')).toHaveAttribute('content', '1200');
	await expect(meta('image:height')).toHaveAttribute('content', '630');
	// The address is the public one; the file is asked of the server under test.
	const image = new URL(await meta('image').getAttribute('content'));
	expect(image.origin).toBe('https://geordi.run');
	const response = await page.request.get(`http://127.0.0.1:${server.port}${image.pathname}`);
	expect(response.headers()['content-type']).toBe('image/png');
});

test('read all three guides from the homepage on a phone without JavaScript', async (t) => {
	const page = await browser.newPage({
		javaScriptEnabled: false,
		viewport: { width: 320, height: 800 }
	});
	t.after(() => page.close());
	await page.goto(`http://127.0.0.1:${server.port}/`);
	await page.getByRole('link', { name: 'Docs', exact: true }).click();
	const navigation = page.getByRole('navigation', { name: 'Documentation' });
	for (const title of ['Your first workspace', 'Configuring a repository', 'Self-hosting']) {
		await navigation.getByRole('link', { name: title }).click();
		await expect(navigation.locator('[aria-current="page"]')).toHaveText(title);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
	}
});

test('the first workspace guide renders the README edit in the shared diff viewer', async (t) => {
	const page = await browser.newPage({ reducedMotion: 'reduce' });
	t.after(() => page.close());
	await page.goto(`http://127.0.0.1:${server.port}/docs/#review-the-diff`);
	const diff = page.getByRole('figure', { name: 'README.md' });
	await diff.scrollIntoViewIfNeeded();
	await expect(diff.getByText('# Example', { exact: true })).toBeVisible();
	await expect(
		diff
			.locator('[data-line-type="change-addition"]')
			.getByText('Use this repository to try Geordi.', { exact: true })
	).toBeVisible();
});

test('copy the guide prompt and inspect its example pull request', async (t) => {
	const page = await browser.newPage({
		permissions: ['clipboard-read', 'clipboard-write'],
		reducedMotion: 'reduce'
	});
	t.after(() => page.close());
	await page.goto(`http://127.0.0.1:${server.port}/docs/`);
	const copy = page.getByRole('button', { name: 'Copy message' });
	await page.locator('astro-island:not([ssr])').filter({ has: copy }).waitFor();
	await copy.click();
	await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
		'Leave the change uncommitted for review.'
	);
	const demo = page.getByRole('figure', { name: 'Workspace actions example' });
	await demo.getByRole('button', { name: 'Create PR', exact: true }).click();
	await demo.getByRole('button', { name: '#1', exact: true }).click();
	await expect(demo.getByText('Check Markdown')).toBeVisible();
	await demo.getByRole('button', { name: 'Fix errors — Explain Geordi in README' }).click();
	await expect(demo.getByText('Ready to merge', { exact: true })).toBeVisible();
	await demo.getByRole('button', { name: 'Merge PR', exact: true }).click();
	await demo.getByRole('button', { name: 'Archive — Explain Geordi in README' }).click();
	await expect(demo.getByText('The workspace is in Archive.')).toBeVisible();
	await demo.getByRole('button', { name: 'Try again' }).click();
	await expect(demo.getByRole('button', { name: 'Create PR', exact: true })).toBeVisible();
});

test('the configuration example opens the app with both jobs and stops dependent jobs', async (t) => {
	const page = await browser.newPage({ reducedMotion: 'reduce' });
	t.after(() => page.close());
	await page.goto(`http://127.0.0.1:${server.port}/docs/configuration/`);
	const pane = page.getByRole('figure', { name: 'Run pane preview' });
	await page.locator('astro-island:not([ssr])').filter({ has: pane }).waitFor();
	await pane.getByRole('button', { name: /Open the app/ }).click();
	await expect(pane.getByRole('button', { name: 'Stop Development server' })).toBeVisible();
	await expect(pane.getByRole('status')).toHaveText('http://localhost:20001/');
	await pane.getByTitle('Show the output of Development server').click();
	await expect(pane.getByRole('status')).toHaveText('pnpm dev --port $PORT');
	await pane.getByRole('button', { name: 'Stop db' }).click();
	await expect(pane.getByRole('button', { name: 'Start Development server' })).toBeVisible();
	await expect(pane.getByRole('button', { name: 'Start db' })).toBeVisible();
});
