/** Textarea keydown handler: Enter submits the form, Shift+Enter inserts a newline. */
export function submitOnEnter(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
	if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
	event.preventDefault();
	event.currentTarget.form?.requestSubmit();
}
