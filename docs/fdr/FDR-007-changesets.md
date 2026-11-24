# FDR-007: Changesets: what a workspace means for the next releases

**Status:** Active
**Last reviewed:** 2026-11-24

## Overview

Many repositories keep notes on their changes with a release tool, which later turns them into version bumps and changelogs. In such a repository, a workspace shows the change notes it adds and what versions they lead to, so that one sees before merging what a piece of work means for the next release.

## Behavior

- In a repository that uses a release tool Geordi knows, a workspace has a **Changeset** tab next to **Changes**, above its terminals. Like every window but the conversation, both can be dragged to any of the workspace's three areas. Changes is in front to begin with.
- When the green **Merge PR** button expands in the sidebar, a pill beside it shows the next version of each package that has a workspace change note and a known version bump. Each pill includes the package name when the release tool provides one.
- The Changeset tab's badge counts the change notes the workspace adds.
- The tab is about what the workspace adds, and nothing else: how many notes merging it adds, and for each package it adds notes to, its name, its version now and after the next release, how big that step is, and those notes with their kind and text. A breaking change is marked. Select the filename to open its diff. Use the pencil to edit the note’s Markdown in place. Save writes the text to the worktree and preserves the note metadata. Cancel discards the draft. If another edit changes the body, saving reports the conflict and keeps the draft.
- Where notes were pending for such a package already, a line says how many: the next version counts them too.
- It follows the files: a note the agent writes, or one that comes in from the main branch, shows at once.
- The first time in a repository, the tab asks: it shows the command it would run to ask the tool, and runs it only once that was allowed. That holds for the repository from then on.
- If the tool can't be asked (it is not installed where the daemon runs, say), the tab says so. What the tool finds wrong with a package or a note is shown with that package.
- Geordi supports Sweet Release and Changesets. The daemon includes the Changesets plan reader. Sweet Release uses the installed `sweet` command.
- When you select **Merge PR**, Geordi compares the current target with the proposed merge. A first minor or major release, or an increase from patch to minor or major, or minor to major, needs confirmation only if it changes the planned version. If both plans produce the same next beta, the merge proceeds. The dialog lists every affected package with both versions. The release tool determines the level, including for packages below 1.0 and dependent packages.
- If the plan is unavailable, you can retry, cancel, or explicitly merge without the check. Repositories without a supported release tool keep their one-click merge.
- **Enable auto-merge** checks the release impact at enablement. If the plan is unavailable, you can retry or cancel. The target can change before the upstream forge merges the PR.

## Design Decisions

### 1. The tool says what is pending

**Decision:** The daemon asks the release tool itself (Sweet Release: `sweet status --json`, which it offers for automation) rather than read the notes and work out versions on its own.
**Why:** Which bump a note causes is the tool's business, and has rules of its own (per-repository change types, breaking changes before 1.0, prereleases). A second implementation would be wrong in the details, and stay wrong as the tool moves on.
**Tradeoff:** The reader must understand the repository’s configuration. The workspace shows any error from the tool.

### 2. The tool runs like our own git does

**Decision:** The tool runs in the worktree with the environment in which we run git there: whatever git it runs looks at the repository's own Git metadata, never the worktree's.
**Why:** The worktree, with its Git metadata, is the agent's to write; a tool that runs git in it the ordinary way would run whatever that metadata says to (ADR-003, `gitIn`).
**And only with the person's word:** the tool runs as the person, in a directory that is the agent's to write, because of files the agent can write. Like the repository's run commands (FDR-006), its command runs only once a person has agreed to it for the repository, which the daemon keeps where no agent can write.
**Tradeoff:** A tool that takes more from the worktree than files and git (code to run, say) could not be run this way, and would need an adapter that reads its files instead.

### 3. One adapter per tool

**Decision:** Everything about a tool is in one adapter in the daemon (`releases.ts`): whether a repository uses it, and how its pending notes are read. The rest of Geordi knows packages, versions and notes, not tools.
**Why:** Release tools differ in where they keep notes and how they are asked, and agree on what they are about. Another tool is another adapter, with nothing to change in the forge or the UI.
**Tradeoff:** What a tool has beyond packages, versions and notes (linked packages, release channels) has no place to show yet.

### 4. Compare committed release plans at merge time

The Changeset tab follows edits in the worktree. A merge uses only published changes, so its confirmation compares the target commit with the proposed merge result. A tool that can read a commit reads both trees straight from the repository's objects (`sweet status --json --rev`, Sweet Release 0.5.0 and later); one that only reads files on disk (Changesets) gets a private checkout of each, with no Git filters (LFS) applied. Geordi repeats the comparison when you confirm. This costs an extra read at merge time and keeps unpublished notes out of the decision.

## Out of Scope

- Creating notes, or preparing releases, from Geordi: agents and people do that with the tool.
