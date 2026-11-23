---
data:
  priority: normal
  status: todo
  tags:
    - desktop
    - security
    - deferred
  type: task
id: y9bqd
title: Run agent hosts on a Node runtime of their own, and turn off Electron's RunAsNode fuse
---
## Context

In the desktop app, the daemon runs each agent's host (ADR-010) and the bundled ACP wrapper with the app's own Electron binary (`process.execPath`), told to behave as Node with `ELECTRON_RUN_AS_NODE=1` (`apps/daemon/src/session.ts`, `host.ts`). Hosts must outlive the app, so Electron's sanctioned way, `utilityProcess` (which the forge and daemon use, ADR-008), does not fit: utility processes end with the app.

This works, and other Electron apps (VS Code) do the same, but it costs us twice:

1. **The variable leaks.** Everything started below a process that has it inherits it, unless every boundary strips it. It reached agents' shells, so an Electron app an agent started ran as plain Node and quit. Fixed by stripping it in the host and the wrapper (branch `geordi/agents-without-electron-run-as-node`), but any new code that runs `process.execPath` has to remember this.
2. **We can't harden the app.** Electron recommends turning off the `RunAsNode` fuse (`@electron/fuses`) in shipped apps. With it on, anyone on the machine can use our signed binary to run arbitrary code that inherits the privacy permissions (TCC) macOS granted Geordi. We set no fuses today, and can't turn this one off while hosts depend on it.

## Proposal

Ship a runtime of our own for the daemon's long-running processes (hosts and wrappers): a plain Node binary next to the app's Electron runtime, or a single-file executable (Node SEA) of the host. Then flip the fuses: `RunAsNode` off, and the rest of Electron's recommended set (`EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` off; `OnlyLoadAppFromAsar`, `EnableEmbeddedAsarIntegrityValidation` where packaging allows).

## Open questions

- Node binary vs. SEA: size (~40–50 MB added either way), signing and notarization of a second executable, the native modules (`node-pty`, `@parcel/watcher`) that must match its ABI.
- Should the daemon move to that runtime too, or stay a utility process?
- Windows and Linux builds: same runtime, or only macOS where TCC makes it matter?
- An ADR, since it changes ADR-008's "one runtime, the app's own".

## Done when

- No Geordi process is started with `ELECTRON_RUN_AS_NODE`; the stripping in `host.ts`, `apps/desktop/scripts/dev.js` and `install.js` is gone.
- The release build sets the `RunAsNode` fuse off (and the others agreed on), verified in CI (`npx @electron/fuses read`).
- Sessions still outlive the app (the "launched daemon" tests in `session.spec.ts` pass on macOS and Windows).
- The desktop release workflow's `ELECTRON_RUN_AS_NODE=1 … require('@lydell/node-pty')` check is replaced by one against the new runtime.