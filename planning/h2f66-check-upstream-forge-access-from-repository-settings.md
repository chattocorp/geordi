---
data:
  priority: normal
  status: done
  type: feature
id: h2f66
title: Check upstream forge access from repository settings
---
Let people check the daemon's forge configuration and read access for a registered repository independently of workspace state. See 0952p.

Each repository has an on-demand forge access check. Verified unknown and local origins in Settings after a forge restart. Tests cover missing origins, Forgejo read success and failure, and the setup link. Select a repository to open its diagnosis and retry the check. Verified keyboard interaction, switching repositories, and the narrow layout in the browser.