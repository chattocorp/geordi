import { createContext } from 'svelte';
import { persisted } from '@geordi/ui/persisted';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

/** The settings page (FDR-005): its sections, and the one last looked at. */
export const sections = [
	{ id: 'general', label: 'General', icon: 'icon-[lucide--sliders-horizontal]' },
	{ id: 'notifications', label: 'Notifications', icon: 'icon-[lucide--bell]' },
	{ id: 'keyboard', label: 'Keyboard', icon: 'icon-[lucide--keyboard]' },
	{ id: 'repositories', label: 'Repositories', icon: 'icon-[lucide--folder-git-2]' },
	{ id: 'providers', label: 'Providers', icon: 'icon-[lucide--cpu]' },
	{ id: 'access', label: 'Agent access', icon: 'icon-[lucide--key-round]' },
	{ id: 'about', label: 'About', icon: 'icon-[lucide--info]' }
] as const;

export type Section = (typeof sections)[number]['id'];

export const isSection = (value: string): value is Section =>
	sections.some((section) => section.id === value);

/** Where the settings were left, so that they open there again. */
export const settings = $state<{ section: Section }>({ section: 'general' });

export const settingsPath = (section: Section = settings.section) =>
	resolve('/settings/[[section]]', { section });

/** Opens the settings, at `section` if given, else where they were left. */
export function openSettings(section?: Section) {
	void goto(settingsPath(section));
}

type RibbonPosition = 'window' | 'pane';
const [getRibbonPosition, setRibbonPosition] = createContext<{ current: RibbonPosition }>();
export { getRibbonPosition };
export const initRibbonPosition = () =>
	setRibbonPosition(persisted<RibbonPosition>('geordi:ribbon-position', 'pane'));
