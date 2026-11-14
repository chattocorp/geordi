import { describe, expect, it } from 'vitest';
import { webUrl } from './url.ts';

describe('webUrl', () => {
	it('keeps web addresses', () => {
		expect(webUrl('https://github.com/acme/widgets/pull/42')).toBe(
			'https://github.com/acme/widgets/pull/42'
		);
		expect(webUrl('http://forge.local/x')).toBe('http://forge.local/x');
	});

	it('drops everything else', () => {
		expect(webUrl('javascript:alert(1)')).toBeNull();
		expect(webUrl(' JavaScript:alert(1)')).toBeNull();
		expect(webUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
		expect(webUrl('/relative')).toBeNull();
		expect(webUrl('')).toBeNull();
		expect(webUrl(null)).toBeNull();
	});
});
