export class ForgeConnection {
	#state = $state<'connecting' | 'connected' | 'lost'>('connecting');
	#grace: ReturnType<typeof setTimeout> | undefined;

	get state() {
		return this.#state;
	}

	/** Give the whole outage one grace period, including any failed retries. */
	waiting() {
		if (this.#grace !== undefined || this.#state === 'lost') return;
		this.#state = 'connecting';
		this.#grace = setTimeout(() => {
			this.#grace = undefined;
			this.#state = 'lost';
		}, 2000);
	}

	opened() {
		clearTimeout(this.#grace);
		this.#grace = undefined;
		this.#state = 'connected';
	}
}
