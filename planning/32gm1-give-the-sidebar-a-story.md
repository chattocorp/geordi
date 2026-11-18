---
data:
  priority: normal
  status: done
  tags:
    - ui
  type: task
id: 32gm1
title: Give the sidebar a story
---
The sidebar lived inline in the root layout, so it had no story and could not be looked at or tested on its own.

Outcome: its sheet (links, workspaces by repository, settings) is `#lib/components/Sidebar.svelte`, given the navigation view and the current path. The layout keeps the title bar part, the width and the resize handle. Stories show every row state, the overview selected, and the sidebar before anything is known.