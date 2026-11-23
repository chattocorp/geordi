---
data:
  priority: normal
  status: done
  type: bug
id: 73vz3
title: Keep focus in the workspace composer
---
Verified in Chromium that starting a workspace focuses its reply box. A browser story checks that the box regains focus after a pending submission from Enter or the Send button.

The composer now remembers to restore focus when a pending remote form reattaches its text field. Verified Send, Queue, and Enter in a running forge. A browser story covers refreshing the field during a queued submission.
