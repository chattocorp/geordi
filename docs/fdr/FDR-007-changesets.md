# FDR-007: Changesets: what a workspace means for the next releases

**Status:** Active
**Last reviewed:** 2026-11-19

## Overview

Many repositories keep notes on their changes with a release tool, which later turns them into version bumps and changelogs. In such a repository, a workspace shows the change notes it adds and what versions they lead to, so that one sees before merging what a piece of work means for the next release.

## Behavior

- In a repository that uses a release tool Geordi knows, a workspace has a **Changeset** tab next to **Changes**, above its terminals. Like every window but the conversation, both can be dragged to any of the workspace's three areas. Changes is in front to begin with.
- The Changeset tab's badge counts the change notes the workspace adds.
- The tab is about what the workspace adds, and nothing else: how many notes merging it adds, and for each package it adds notes to, its name, its version now and after the next release, how big that step is, and those notes with their kind and text. A breaking change is marked. Select the filename to open its diff. Use the pencil to edit the note’s Markdown in place. Save writes the text to the worktree and preserves the note metadata. Cancel discards the draft. If another edit changes the body, saving reports the conflict and keeps the draft.
- Where notes were pending for such a package already, a line says how many: the next version counts them too.
- It follows the files: a note the agent writes, or one that comes in from the main branch, shows at once.
- The first time in a repository, the tab asks: it shows the command it would run to ask the tool, and runs it only once that was allowed. That holds for the repository from then on.
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
**And only with the person's word:** the tool runs as the person, in a directory that is the agent's to write, because of files the agent can write. Like the repository's run commands (FDR-006), its command runs only once a person has agreed to it for the repository, which the daemon keeps where no agent can write.
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

- Creating notes, or preparing releases, from Geordi: agents and people do that with the tool.
- Tools other than Sweet Release, for now.
