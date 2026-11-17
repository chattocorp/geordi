import { WebLinksAddon } from '@xterm/addon-web-links';

export function terminalLinks(): WebLinksAddon {
	return new WebLinksAddon((_event, uri) => {
		// Supply the URL immediately so the desktop app can open it externally.
		window.open(uri, '_blank', 'noopener,noreferrer');
	});
}
