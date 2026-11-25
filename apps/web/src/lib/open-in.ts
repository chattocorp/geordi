export type OpenInApp = { id: string; name: string; command: string; enabled: boolean };
export type OpenInSettings = { revision: number; apps: OpenInApp[] };

// The prefix and UUID fit the terminal name limit of 40 characters.
export const OPEN_IN_TERMINAL = 'app-';
