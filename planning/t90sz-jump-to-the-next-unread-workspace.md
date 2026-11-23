---
data:
  priority: normal
  status: done
  type: feature
id: t90sz
title: Jump to the next unread workspace
---
Cmd/Ctrl+Shift+Enter opens the next unread workspace in visible sidebar order. Verified both shortcuts in the running forge with two unread workspaces. Regression tests cover skipping read rows, wrapping, starting outside the list, and finding no unread destination.