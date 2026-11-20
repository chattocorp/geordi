type Visit = {
	seen: number;
	range?: { after: number; through: number };
	text?: string;
};

const fallback = new Map<string, Visit>();

function read(key: string): Visit | undefined {
	try {
		const value = JSON.parse(localStorage.getItem(key) ?? 'null');
		if (value && Number.isSafeInteger(value.seen)) return value;
	} catch {
		/* Storage may be unavailable. */
	}
	return fallback.get(key);
}

function save(key: string, visit: Visit) {
	fallback.set(key, visit);
	try {
		localStorage.setItem(key, JSON.stringify(visit));
	} catch {
		/* Keep the in-memory visit. */
	}
}

/** One mounted conversation. Only its focused, visible window marks activity as seen. */
export function watchReturn(
	id: string,
	activity: () => number,
	generate: (after: number, through: number) => Promise<string>,
	show: (text: string) => void
) {
	const key = 'geordi:recap:' + id;
	let present = false;
	let mounted = true;
	let visitNumber = 0;
	function update() {
		const through = activity();
		const visible = document.visibilityState === 'visible' && document.hasFocus();
		if (!visible) {
			present = false;
			return;
		}

		const visit = read(key);
		if (present) {
			if (visit && through > visit.seen) {
				save(key, { seen: through });
				if (visit.text) show('');
			}
			return;
		}
		present = true;
		const returning = ++visitNumber;
		if (!visit) {
			save(key, { seen: through });
			return;
		}
		if (through < visit.seen) return;
		const range = through > visit.seen ? { after: visit.seen, through } : visit.range;
		if (!range || (through === visit.seen && visit.text)) {
			show(visit.text ?? '');
			return;
		}
		save(key, { seen: through, range });
		show('');
		void generate(range.after, through)
			.then((text) => {
				const latest = read(key);
				if (latest?.range?.after === range.after && latest.range.through === through)
					save(key, { seen: through, range, text });
				if (mounted && present && visitNumber === returning) show(text);
			})
			.catch(() => {
				/* Retain the interval for the next return. */
			});
	}
	window.addEventListener('focus', update);
	window.addEventListener('blur', away);
	document.addEventListener('visibilitychange', update);
	function away() {
		present = false;
	}
	update();
	return {
		update,
		destroy() {
			mounted = false;
			window.removeEventListener('focus', update);
			window.removeEventListener('blur', away);
			document.removeEventListener('visibilitychange', update);
		}
	};
}
