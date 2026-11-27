import type { Attachment } from 'svelte/attachments';

export type MenuTone = 'danger' | 'accent' | 'ok' | 'merged';

/** One thing a menu offers, or a line between groups of them. */
export type MenuItem =
	| {
			label: string;
			/** An Iconify class. */
			icon?: string;
			/**
			 * A colour for it: `danger` for something that can't be taken back; the others for
			 * what a menu suggests doing, in the colour of why.
			 */
			tone?: MenuTone;
			disabled?: boolean;
			/** The keys that do the same, shown beside it: as `Keys` takes them (`['alt', 'enter']`). */
			keys?: string[];
			onselect(): void;
	  }
	| 'separator';

/** The context menu that is open, if one is: there is only ever one. `ContextMenu` shows it. */
export const contextMenus = $state<{ open: { x: number; y: number; items: MenuItem[] } | null }>({
	open: null
});

/**
 * Gives an element a context menu: `{@attach contextMenu(() => [...])}`. The items are
 * worked out when the menu is asked for (a right-click, a long press, or the menu key), so
 * they can follow from state. No items, no menu: the browser's own then shows.
 */
export function contextMenu(items: () => MenuItem[]): Attachment<HTMLElement> {
	return (node) => {
		const show = (event: MouseEvent) => {
			const list = items();
			if (list.length === 0) return;
			event.preventDefault();
			// asked for with the keyboard, there is no pointer: open at the element
			const box = node.getBoundingClientRect();
			const pointed = event.clientX !== 0 || event.clientY !== 0;
			contextMenus.open = {
				x: pointed ? event.clientX : box.left + 16,
				y: pointed ? event.clientY : box.bottom,
				items: list
			};
		};
		node.addEventListener('contextmenu', show);
		return () => node.removeEventListener('contextmenu', show);
	};
}

/** Opens a menu under an element: for a button that offers several things to do. */
export function openMenu(under: Element, items: MenuItem[]) {
	if (items.length === 0) return;
	const box = under.getBoundingClientRect();
	contextMenus.open = { x: box.left, y: box.bottom + 4, items };
}
