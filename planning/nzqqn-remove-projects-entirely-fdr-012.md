---
data:
  priority: normal
  status: todo
  tags:
    - deferred
  type: task
id: nzqqn
title: Remove projects entirely (FDR-012)
---
Projects (FDR-012, feature qae71) are deprecated: as of 2026-11-21 new ones can no longer be started (repository chooser, sidebar, `createWorkspace` requires a `repoId`). Existing projects still work, archive and restore. In a later version, remove them from the app entirely.

## Scope

- **Existing projects:** decide how old project workspaces are handled on replay (`legacy.ts`): dropped, or kept readable in the archive.
- **Forge:** `repoId` becomes `string`, never `null`; `locate()` folds into `ref()`; drop `isProject`, the project rule in `sees`, the `project` caller kind and description in `mcp.ts`, the project text in `instructions.ts`, the project branches in `workspaces.remote.ts` (restore), `archive.ts`, `family.ts`, `views.ts`, the picture route, and the Projects section of the sidebar.
- **Protocol / daemon:** drop `ProjectRef`, `closeProject`, `projectPicture`; remove `apps/daemon/src/projects.ts` and its uses (`main.ts`, `turn-starts.ts`).
- **Tests and stories:** remove project cases (`workspaces.spec`, `mcp.spec`, `archive.spec`, `archive-preview.spec`, `turn-starts.spec`, Sidebar/Archive stories).
- **Docs:** FDR-012 to Withdrawn; remove projects from `CLAUDE.md` and FDR-002; breaking release note.
- Leave project folders on disk alone.

## Acceptance criteria

- No code path handles a workspace without a repository.
- `pnpm check && pnpm lint && pnpm test && sweet doctor` pass.
