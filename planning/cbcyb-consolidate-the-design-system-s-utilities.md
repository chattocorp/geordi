---
data:
  priority: normal
  status: done
  type: task
id: cbcyb
title: Consolidate the design system's utilities
---
Audit of the layer between tokens and components (ADR-005), and the consolidation that followed.

## Outcome

- `item` is the one row you can pick (hover is `bg-hover`); `item-active` for the current one, `item-picked` for one chosen or in hand. `menu-item` builds on it; `menu-item-active` is gone.
- `tone-ok`/`-danger`/`-merged`/`-accent` replace `status-*` and every hand-mixed tint. The `accent-soft` and `danger-soft` tokens are gone: tints are see-through.
- `raised` is what `card`, `card-float`, `input` and small floating controls share.
- `faint` replaces `text-muted/50…80`.
- `card-link` and `dot-live` are gone.
- `Foundations/Screens` in Storybook mocks whole screens from the system's parts.

## Left as they are

- Handwritten icon buttons (`RunPane`, `WorkspaceRow`, `SidebarRowLabel`): they hold snippets, not an icon class, so `Button` does not fit without growing.
- Rows that are not rounded or hover only when linked (`Changes`, `PullChecks`, `BackgroundTasks`).
- Meter tracks (`fill-muted/30`, `stroke-muted/40`).
- The four drop-line utilities.