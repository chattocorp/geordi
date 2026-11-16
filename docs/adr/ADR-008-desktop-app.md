# ADR-008: A desktop app that runs forge and daemon unchanged

**Date:** 2026-11-16

## Context

Geordi is built with Geordi. Run from the repository (`pnpm dev`), forge and daemon restart whenever a file changes, which is exactly what one does while working on them. We want a Geordi that is installed and stays put, for working on Geordi and on everything else. Later, the app should also connect to daemons on other machines.

## Decision

- `apps/desktop` is an **Electron shell** (macOS for now). Its main process starts the forge's production build and the daemon as processes of their own (Electron utility processes, which run on Electron's Node), and shows the forge in a window. Neither knows it runs in an app: they are configured through their environment and talk over the protocol, as always.
- The app is built from a **stage directory** (`scripts/build.js`): the forge's build as it is, the daemon bundled into one file, the terminal library with its native binary, and the main script. For the forge's build to need nothing but Node, all of the web app's packages are `devDependencies`, which the Node adapter bundles.
- The app has **ports of its own** (7717 for the web, 7718 for the daemon) and uses the default data directory (`~/.geordi`). A Geordi under development runs alongside, with its data in `.data/`.
- Services get the **environment of a login shell**: an app started from the Finder has no `PATH` to find `claude`, `codex`, `git` or `gh` with.
- **Quitting leaves agents working** (ADR-007); the next launch picks them up. This is also how the app is updated (`pnpm desktop:install`). "Stop Daemon and Its Agents" in the menu is the app's Ctrl+C. A daemon that falls over is started again.
- Only one instance runs: two daemons must not follow the same turns.

## Consequences

- The app adds no second way of running anything. What works in it works on a server, and the other way round.
- The app is not signed or notarised, and there are no updates: it is built and installed from the repository, on the machine it runs on.
- The window shows a local web server, which other programs on the machine can reach too, as before.
- The app's main script treats the local daemon as one it happens to start. Connecting to remote daemons needs the app's side to dial out, per-daemon credentials (2395q), and repositories that belong to a daemon; none of that is decided here.
- Terminals still end when the app quits (ADR-007).
