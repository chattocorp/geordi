---
data:
  priority: normal
  status: done
  type: bug
id: 4hxgt
title: Keep the merge ribbon current after a successful merge
---
Keep Merge PR busy from the click until the live workspace view shows Archive after a confirmed merge. Failed attempts can be retried.

The ribbon uses the daemon's merge result to keep the action disabled for that pull request while the live view catches up.