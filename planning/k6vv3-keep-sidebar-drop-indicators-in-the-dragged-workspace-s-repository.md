---
data:
  priority: normal
  status: done
  type: bug
id: k6vv3
title: Keep sidebar drop indicators in the dragged workspace's repository
---
Follow up on 63t15. Show a single insertion line in the source repository. Clear it when the drag leaves the rows and reject drops in other repositories.

Verified with a native Chromium drag across two repositories and a Storybook regression test for leaving, returning, and canceling.