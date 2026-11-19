---
data:
  priority: normal
  status: done
  type: feature
id: mf23g
title: Share conversation messages and tool activity with the website
---
Render the demo conversation with the same message and tool activity components as the forge. Preserve live and completed calls, disclosure, and static rendering.

Both apps use @geordi/ui for user messages, agent replies and tool activity (ADR-011). The demo pauses while completed activity is open. Verified live calls, inputs and results, clipboard, playback resumption, reduced motion on mobile and static HTML in Chromium. Both apps build and repository checks pass.