type Visit = {
	seen: number;
	awayAt?: number;
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
	activity: () => { through: number; trigger: number },
	generate: (after: number, through: number) => Promise<string>,
	show: (text: string) => void
) {
	const key = 'geordi:recap:' + id;
	let present = false;
	let mounted = true;
	let visitNumber = 0;
	function update() {
		const { through, trigger } = activity();
		const visible = document.visibilityState === 'visible' && document.hasFocus();
		if (!visible) {
			away();
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
		if (through === visit.seen) {
			save(key, { ...visit, awayAt: undefined });
			show(visit.text ?? '');
			return;
		}
		if (
			visit.awayAt === undefined ||
			Date.now() - visit.awayAt < 5 * 60_000 ||
			trigger <= visit.seen
		) {
			save(key, { seen: through });
			show('');
			return;
		}
		const range = { after: visit.seen, through };
		save(key, { seen: through, range });
		show('');
		void generate(range.after, through)
			.then((text) => {
				const latest = read(key);
				if (latest?.range?.after === range.after && latest.range.through === through)
					save(key, { ...latest, text });
				if (mounted && present && visitNumber === returning) show(text);
			})
			.catch(() => {
				/* A later qualifying visit can start a fresh recap. */
			});
	}
	window.addEventListener('focus', update);
	window.addEventListener('blur', away);
	window.addEventListener('pagehide', away);
	document.addEventListener('visibilitychange', update);
	function away() {
		if (!present) return;
		present = false;
		const visit = read(key);
		if (visit) save(key, { ...visit, awayAt: Date.now() });
	}
	update();
	return {
		update,
		destroy() {
			away();
			mounted = false;
			window.removeEventListener('focus', update);
			window.removeEventListener('blur', away);
			window.removeEventListener('pagehide', away);
			document.removeEventListener('visibilitychange', update);
		}
	};
}
