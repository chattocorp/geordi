---
data:
  priority: normal
  status: done
  tags: []
  type: feature
id: 14rk7
title: Group tasks in the Tasks tab
---
Long task lists (twenty-odd playtest/sortie tasks in one repository) are hard to scan in the Tasks tab.

## Outcome (2026-11-23)

No `group:` setting and no nesting (the person disliked both). Sections come from labels instead: tasks whose labels begin alike with ` / ` (`Sorties / Ring 1`) form a section, which folds (remembered per browser), stands where its first task would, and names each task by the rest of its label. A folded section still shows when something in it runs or starts. Defaults stay first under their full labels. Recorded as FDR-006 decision 16; `RunPane.svelte`, story "Sections".

Task groups and change sections (wy0wt) share the sidebar repository spacing. Adjacent rows within a group keep their one-pixel gap.

The Tasks tab shows one faint, full-width separator in the space between a group and its neighbor. The first and last rows have no outer separator. Folded group labels use a stronger text color at the same size. The separator has a stronger tint in light mode and a softer tint in dark mode.
