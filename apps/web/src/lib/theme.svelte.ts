/** The palette and color mode belong to this browser. app.html applies both before first paint. */
export type Theme = 'system' | 'light' | 'dark';

export const palettes = ['Geordi', 'Graphite', 'Slate', 'Parchment', 'Forest', 'Plum'] as const;
export type Palette = (typeof palettes)[number];

const system = () => matchMedia('(prefers-color-scheme: dark)');

function stored(key: string) {
	if (typeof window === 'undefined') return null;
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function savedMode(): Theme {
	const value = stored('theme');
	return value === 'light' || value === 'dark' ? value : 'system';
}

function savedPalette(): Palette {
	const value = stored('palette');
	return palettes.find((palette) => palette === value) ?? 'Geordi';
}

let current = $state<Theme>(savedMode());
let palette = $state<Palette>(savedPalette());

function apply() {
	document.documentElement.classList.toggle(
		'dark',
		current === 'system' ? system().matches : current === 'dark'
	);
	document.documentElement.dataset.palette = palette;
}

if (typeof document !== 'undefined') {
	system().addEventListener('change', apply);
	window.addEventListener('storage', (event) => {
		if (event.key === null || event.key === 'theme' || event.key === 'palette') {
			current = savedMode();
			palette = savedPalette();
			apply();
		}
	});
}

function save(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// Storage unavailable: the choice lasts for this page only.
	}
	switchTo();
}

/** Applies the theme, cross-fading to it (the View Transition's default) unless motion is unwelcome. */
function switchTo() {
	if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches)
		return apply();
	document.startViewTransition(apply);
}

export const theme = {
	get current() {
		return current;
	},
	set current(next: Theme) {
		current = next;
		save('theme', next === 'system' ? null : next);
	},
	get palette() {
		return palette;
	},
	set palette(next: Palette) {
		palette = next;
		save('palette', next === 'Geordi' ? null : next);
	}
};
