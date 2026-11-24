---
data:
  priority: normal
  status: done
  type: feature
id: wy0wt
title: 'Repository sections: group the Changes tab by the repository''s parts'
---
A repository's `.geordi.yml` can name its parts (`sections`: a list of `path` + `title`, and optionally `icon`). The Changes tab groups a workspace's changed files under those titles, in the file's order, with the rest under Other, whenever the changes touch two or more sections. Sections fold shut; list and tree views work within each; what is folded is remembered per workspace in the browser. Folded, a section shows its file count and the lines added and removed in it.

Done:
- `sections` parsed and validated by the daemon (`config.ts`), sent with `RepoConfig`, described in `CONFIG_SETTINGS`, reported by `check_configuration`.
- Grouping in `@geordi/ui/sections` (`bySection`; longest containing path wins), tested.
- `Changes.svelte` renders foldable sections; folds are a bindable prop, persisted per workspace by `WorkspaceView`. Stories "Sections of the repository", "Sections with pictures" and "Remembered folds".
- Section headings, task groups and sidebar repositories share `RowLabel` (`@geordi/ui`); headings are `muted`, folded counts `faint`.
- Section pictures: `icon` in the file (PNG, JPEG, WebP, GIF or SVG), else the favicon/icon/logo nearest the section's directory among tracked files (`withIcons` in the daemon's `icon.ts`; `.geordi.svg/.png/.ico` first, standing only for their own directory; no `.ico` for sections). Shown from the worktree via `/workspaces/[id]/picture?file`, versioned with the worktree, drawn by `PictureIcon` (shared with `RepoIcon`).
- Geordi's own `.geordi.yml` has sections, with `.geordi.svg` pictures.
- FDR-006 updated (decision 17). Reviewed (GPT-6.2-Astra); its four findings fixed.
- Checked end to end in the dev app: pictures from the worktree, folds across a reload and a forge restart.

Follow-ups: `yaj11` (cache the icon lookup), `h7h0g` (combined diff in sections), `y8xfm` (sections as context for agents). Unrelated, found along the way: `qy4am` (daemon file-watching tests failing locally).