/**
 * Draws the code blocks that `markdown.ts` marked as diagrams, in their place: Mermaid with
 * Pele, SVG as a picture. A block that cannot be drawn (half written, still coming in, or
 * wrong) stays code. Nothing drawn loads anything from anywhere: Pele draws neither images
 * nor links, and an SVG shown as a picture can neither run scripts nor load what it names.
 * Returns what puts the code back.
 */
export function drawDiagrams(root: HTMLElement): () => void {
	const undo: (() => void)[] = [];
	let gone = false;
	for (const block of root.querySelectorAll<HTMLElement>('.code-block[data-diagram]')) {
		const source = block.querySelector('pre')?.textContent ?? '';
		const draw = block.dataset.diagram === 'svg' ? drawSvg : drawMermaid;
		void draw(block, source).then((remove) => {
			if (!remove) return;
			if (gone) return remove();
			block.hidden = true;
			undo.push(() => {
				remove();
				block.hidden = false;
			});
		});
	}
	return () => {
		gone = true;
		for (const step of undo) step();
	};
}

/** Draws `source` right after `block`; says how to take it away again, if it could be drawn. */
type Draw = (block: HTMLElement, source: string) => Promise<(() => void) | null>;

const drawSvg: Draw = (block, source) =>
	new Promise((resolve) => {
		const picture = document.createElement('img');
		picture.alt = 'SVG picture';
		picture.dataset.svg = '';
		picture.onload = () => {
			block.after(picture);
			resolve(() => picture.remove());
		};
		picture.onerror = () => resolve(null);
		picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
	});

const drawMermaid: Draw = async (block, source) => {
	const { mountAsync } = await import('pele/lazy');
	const figure = document.createElement('div');
	figure.className = 'diagram';
	// Pele measures what it draws in, so the figure is in the page from the start: empty
	// until there is a diagram, and gone again if there is none
	block.after(figure);
	let failed = false;
	const diagram = await mountAsync(figure, source, {
		images: false,
		links: false,
		onError: () => (failed = true)
	}).catch(() => null);
	const remove = () => {
		diagram?.destroy();
		figure.remove();
	};
	if (!diagram || failed) return (remove(), null);
	return remove;
};
