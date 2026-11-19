---
data:
  priority: normal
  status: done
  type: bug
id: 996x1
title: Keep replies together when earlier tools finish
---
The daemon flushes buffered text when a new tool starts. Updates to an earlier tool can now arrive between chunks of a reply without splitting it. A session regression test reproduces the reported mid-word split and checks the resulting event order.