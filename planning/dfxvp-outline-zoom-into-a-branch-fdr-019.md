---
data:
  priority: normal
  status: done
  tags:
    - outline
  type: feature
id: dfxvp
title: 'Outline: zoom into a branch (FDR-019)'
---
Focus the outline on one item's branch, as in Workflowy: a breadcrumb of the items above, and that branch as the whole list.

## Outcome (2026-11-27)

Built in the shared outline editor (`Outline.svelte`), so it works in the sidebar and in the Plan window (FDR-019, "Zooming", decision 9):

- A magnifying glass on a hovered row, "Zoom in" in its menu, or Cmd-. on it; Back, Cmd-Shift-. or the breadcrumb zooms out.
- Each zoom is a step in the browser history (`zoomInHistory`, `#lib/zoom.svelte.ts`; shallow routing, `page.state.zoom`), kept besides per browser (`geordi:zoom`, `geordi:plan-zoom:<id>`) so it outlasts going to another page.
- The item zoomed into is a heading over its branch; "New item" and Enter write into it.
- Sidebar: any item, a workspace's too. Plan window: only items of the scope.
- Previous/next workspace follow the zoomed sidebar.
- `zoomedInto` and `zoomTrail` in `family.ts`, tested; stories for both places.

The repository focus stays as it is.
