---
data:
  priority: normal
  status: done
  type: feature
id: derdh
title: Share sidebar workspace rows with the website demo
---
Render workspace activity, standing and available actions with the forge row in the website demo. Keep navigation and workspace commands in the forge.

The forge and demo use WorkspaceRow and StandingIcon from @geordi/ui (ADR-011). Verified activity, checks, merge and archive during demo playback, the mobile layout, and both static fallbacks in Chromium. Storybook covers display-only rows, linked rows, action pills and reordering.