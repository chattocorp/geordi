---
data:
  priority: normal
  status: done
  type: task
id: 0gjb4
title: Smoke-test the built website demo in Chromium
---
The website test command builds the static site and serves it to Chromium. One test opens two changed files, checks the code after switching tabs, and opens #412 and expands its checks. A fresh JavaScript-disabled page verifies the conversation, changed files and static diff. Both tests run with pnpm test in CI.