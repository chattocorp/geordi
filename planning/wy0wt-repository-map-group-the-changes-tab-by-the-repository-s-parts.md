---
data:
  priority: normal
  status: done
  type: feature
id: wy0wt
title: 'Repository sections: group the Changes tab by the repository''s parts'
---
A repository's `.geordi.yml` can name its parts (`sections`: a list of `path` + `title`, and optionally `icon`). The Changes tab groups a workspace's changed files under those titles, in the file's order, with the rest under Other, whenever the changes touch two or more sections. Sections fold shut; list and tree views work within each; what is folded is remembered per workspace in the browser.

Done:
- `sections` parsed and validated by the daemon (`config.ts`), sent with `RepoConfig`, described in `CONFIG_SETTINGS`, reported by `check_configuration`.
- Grouping in `@geordi/ui/sections` (`bySection`; longest containing path wins), tested.
- `Changes.svelte` renders foldable sections; folds are a bindable prop, persisted per workspace by `WorkspaceView`. Stories "Sections of the repository", "Sections with pictures" and "Remembered folds".
- Section headings, task groups and sidebar repositories share `RowLabel` (`@geordi/ui`); headings are `faint`.
- Section icons: `icon` in the file, else the favicon/icon/logo nearest the section's directory among tracked files (`withIcons` in the daemon's `icon.ts`; no `.ico`). Shown from the worktree via `/workspaces/[id]/picture?file`, drawn by `PictureIcon` (shared with `RepoIcon`).
- Geordi's own `.geordi.yml` has sections.
- FDR-006 updated (decision 17).

Later (not yet): the combined diff in sections; handing the sections to agents as context.