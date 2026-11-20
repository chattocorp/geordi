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
	for (const name of ['#412', 'Archive']) {
		// A release link can appear above the demo. Read both rectangles in the same frame.
		const { bounds, box } = await header
			.getByRole('button', { name, exact: true })
			.evaluate((button) => ({
				bounds: button.closest('header').getBoundingClientRect().toJSON(),
				box: button.getBoundingClientRect().toJSON()
			}));
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

test('download links follow the stable release and the next published beta', async (t) => {
	const page = await browser.newPage();
	t.after(() => page.close());
	const api = 'https://api.github.com/repos/chattocorp/geordi/releases';
	const tags = 'https://github.com/chattocorp/geordi/releases/tag/';
	await page.route(api + '/latest', (route) => route.fulfill({ json: { tag_name: 'v0.9.0' } }));
	let candidates = [
		{ tag_name: 'v0.11.0-beta.0', prerelease: true, draft: true },
		{ tag_name: 'v0.10.0-beta.2', prerelease: true, draft: false }
	];
	await page.route(api + '?page=1', (route) => route.fulfill({ json: candidates }));
	await page.goto(`http://127.0.0.1:${server.port}/`);
	const beta = page.getByRole('link', { name: 'Try 0.10.0-beta.2' });
	await expect(beta).toHaveCount(2);
	await expect(beta.first()).toHaveAttribute('href', tags + 'v0.10.0-beta.2');
	await expect(page.getByRole('link', { name: 'Download stable 0.9.0' }).first()).toHaveAttribute(
		'href',
		tags + 'v0.9.0'
	);

	candidates = [{ tag_name: 'v0.9.0-beta.1', prerelease: true, draft: false }];
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.getByRole('link', { name: /^Try .*beta/ })).toHaveCount(0);

	await page.route(api + '/latest', (route) => route.fulfill({ status: 403 }));
	await page.reload({ waitUntil: 'networkidle' });
	await expect(
		page.getByRole('link', { name: 'Download stable', exact: true }).first()
	).toHaveAttribute('href', 'https://github.com/chattocorp/geordi/releases/latest');
});
