---
data:
  priority: normal
  status: done
  tags:
    - ui
  type: bug
id: p8kpw
title: Raise light mode text contrast
---
Secondary text, status colours and sidebar repository names fell below 4.5:1 in light mode.

Outcome: light `--muted`, `--ok`, `--danger` and `--accent-ink` darkened so each reads at 4.5:1 or better on every surface tone; sidebar repository names and the settings shortcut hint use plain `text-muted`. Dark tokens unchanged.