# FDR-007: Changesets: what a workspace means for the next releases

**Status:** Active
**Last reviewed:** 2026-11-16

## Overview

Many repositories keep notes on their changes with a release tool, which later turns them into version bumps and changelogs. In such a repository, a workspace shows the change notes it adds and what versions they lead to, so that one sees before merging what a piece of work means for the next release.

## Behavior

- What a workspace has done is in tabs, above its terminals: **Changes** (its files, as before) and, in a repository that uses a release tool Geordi knows, **Changeset**. The tab that was looked at last stays in front.
- The Changeset tab's badge counts the change notes the workspace adds.
- The tab says how many notes merging the workspace adds, and lists each package it adds notes to: its name, its version now and after the next release, how big that step is, and its notes with their kind and text. A breaking change is marked.
- A note the workspace adds opens as a diff when clicked. Notes that were pending before the workspace are listed with their package too, muted: the next version is the result of all of them.
- Packages that have notes pending without the workspace are listed below, muted, under "Pending without this workspace".
- It follows the files: a note the agent writes, or one that comes in from the main branch, shows at once.
- If the tool can't be asked (it is not installed where the daemon runs, say), the tab says so. What the tool finds wrong with a package or a note is shown with that package.
- The first tool Geordi knows is Sweet Release.

## Design Decisions

### 1. The tool says what is pending

**Decision:** The daemon asks the release tool itself (Sweet Release: `sweet status --json`, which it offers for automation) rather than read the notes and work out versions on its own.
**Why:** Which bump a note causes is the tool's business, and has rules of its own (per-repository change types, breaking changes before 1.0, prereleases). A second implementation would be wrong in the details, and stay wrong as the tool moves on.
**Tradeoff:** The tool has to be installed where the daemon runs, in a version that understands the repository; without it the tab only says that it is missing.

### 2. The tool runs like our own git does

**Decision:** The tool runs in the worktree with the environment in which we run git there: whatever git it runs looks at the repository's own Git metadata, never the worktree's.
**Why:** The worktree, with its Git metadata, is the agent's to write; a tool that runs git in it the ordinary way would run whatever that metadata says to (ADR-003, `gitIn`).
**Tradeoff:** A tool that takes more from the worktree than files and git (code to run, say) could not be run this way, and would need an adapter that reads its files instead.

### 3. One adapter per tool

**Decision:** Everything about a tool is in one adapter in the daemon (`releases.ts`): whether a repository uses it, and how its pending notes are read. The rest of Geordi knows packages, versions and notes, not tools.
**Why:** Release tools differ in where they keep notes and how they are asked, and agree on what they are about. Another tool (changesets, say) is another adapter, with nothing to change in the forge or the UI.
**Tradeoff:** What a tool has beyond packages, versions and notes (linked packages, release channels) has no place to show yet.

### 4. What merging leads to, not what it changes

**Decision:** The tab shows each package's next version as the worktree has it: with the workspace's notes and everything that was pending already.
**Why:** That is the version the next release will have once the workspace is merged, which is what one wants to know. Telling apart what the workspace alone would change needs the tool to run on the main branch's files too, which are not checked out anywhere.
**Tradeoff:** A workspace whose notes don't move the version any further than pending ones already did looks the same as one that does.

## Out of Scope

- Writing notes, or preparing releases, from Geordi: agents and people do that with the tool.
- Tools other than Sweet Release, for now.
