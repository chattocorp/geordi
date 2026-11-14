/**
 * A URL we got from elsewhere (a daemon, an upstream forge), if it is safe to link to: only
 * web addresses. Anything else, such as `javascript:`, would run in our page when clicked.
 */
export function webUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return ['http:', 'https:'].includes(new URL(url).protocol) ? url : null;
	} catch {
		return null;
	}
}
