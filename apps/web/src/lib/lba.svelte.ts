/**
 * Low battery anxiety mode: hides the batteries that show what usage limits leave. Kept in
 * this browser (`geordi:lba` in localStorage), like the theme.
 */
const key = 'geordi:lba';

function stored() {
	try {
		return localStorage.getItem(key) === 'on';
	} catch {
		return false; // storage unavailable (private mode)
	}
}

let on = $state(typeof document !== 'undefined' && stored());

export const lba = {
	get on() {
		return on;
	},
	set on(next: boolean) {
		on = next;
		try {
			if (next) localStorage.setItem(key, 'on');
			else localStorage.removeItem(key);
		} catch {
			// storage unavailable: the choice lasts for this page only
		}
	}
};
