/**
 * Light or dark, or whatever the system says. Kept in this browser (`theme` in
 * localStorage; nothing stored means "system") and applied as the `dark` class on <html>,
 * which `app.html` also does before first paint.
 */
export type Theme = 'system' | 'light' | 'dark';

const system = () => matchMedia('(prefers-color-scheme: dark)');

function stored(): Theme {
	try {
		const saved = localStorage.getItem('theme');
		return saved === 'light' || saved === 'dark' ? saved : 'system';
	} catch {
		return 'system'; // storage unavailable (private mode)
	}
}

let current = $state<Theme>(typeof document === 'undefined' ? 'system' : stored());

const apply = () =>
	document.documentElement.classList.toggle(
		'dark',
		current === 'system' ? system().matches : current === 'dark'
	);

// follow the system while that is what was asked for
if (typeof document !== 'undefined') system().addEventListener('change', apply);

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
		switchTo();
		try {
			if (next === 'system') localStorage.removeItem('theme');
			else localStorage.setItem('theme', next);
		} catch {
			// storage unavailable: the choice lasts for this page only
		}
	}
};
