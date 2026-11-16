/** The settings dialog (FDR-005): whether it shows, and which of its sections. */
export type Section = 'general' | 'notifications' | 'repositories';

export const settings = $state<{ open: boolean; section: Section }>({
	open: false,
	section: 'general'
});

/** Opens the settings, at `section` if given, else where they were left. */
export function openSettings(section?: Section) {
	if (section) settings.section = section;
	settings.open = true;
}
