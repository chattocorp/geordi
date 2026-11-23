/**
 * Preloaded (`--require`) into what the host runs with the app's own runtime (`host.ts`):
 * Electron, told to be Node by `ELECTRON_RUN_AS_NODE`. It reads that only as it starts, so
 * it can forget it here, before any other code runs, and what this process starts (the
 * agent's CLI, its shells, an Electron app they open) is not told to be Node too.
 */
delete process.env.ELECTRON_RUN_AS_NODE;
