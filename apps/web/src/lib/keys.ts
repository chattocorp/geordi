/**
 * Which sidebar a key press asks to toggle: Cmd+B (Ctrl+B elsewhere than on a Mac) the left
 * one, with Alt/Option the right one. Not while typing in a terminal with Ctrl: there,
 * Ctrl+B belongs to the shell.
 */
export function sidebarToggle(event: KeyboardEvent): 'left' | 'right' | null {
	const mac = /Mac|iPhone|iPad/.test(navigator.platform);
	if (event.code !== 'KeyB' || event.shiftKey) return null;
	if (!(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return null;
	if (!mac && (event.target as Element | null)?.closest?.('.xterm')) return null;
	return event.altKey ? 'right' : 'left';
}

/** The modifier key for shortcuts, as people know it on their platform. */
export const modifierKey = () =>
	typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/** Textarea keydown handler: Enter submits the form, Shift+Enter inserts a newline. */
export function submitOnEnter(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
	if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
	event.preventDefault();
	event.currentTarget.form?.requestSubmit();
}
