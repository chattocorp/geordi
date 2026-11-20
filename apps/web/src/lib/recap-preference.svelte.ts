const key = 'geordi:automatic-recaps';
function read() {
	try {
		return localStorage.getItem(key) !== 'off';
	} catch {
		return true;
	}
}

let enabled = $state(typeof window === 'undefined' || read());
if (typeof window !== 'undefined')
	window.addEventListener('storage', (event) => {
		if (event.key === key || event.key === null) enabled = read();
	});

export const recapPreference = {
	get on() {
		return enabled;
	},
	set on(value: boolean) {
		enabled = value;
		try {
			localStorage.setItem(key, value ? 'on' : 'off');
		} catch {
			/* Use the preference for this window. */
		}
	}
};
