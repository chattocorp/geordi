import { launchApp } from '../../../routes/open-in.remote';

// The workspace that owns a persistent app terminal can focus it, wherever it was launched.
export const appFocus = $state<{ requested?: { workspaceId: string; terminal: string } }>({});

export async function openInApp(workspaceId: string, appId: string, revision: number) {
	appFocus.requested = undefined;
	const terminal = await launchApp({ workspaceId, appId, revision });
	appFocus.requested = { workspaceId, terminal };
}
