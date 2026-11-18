---
data:
  priority: normal
  status: done
  type: task
id: x4sha
title: Run repository checks on pull requests
---
Run the type checks, lint and full test suite in GitHub Actions for pull requests and pushes to main. Verify the workflow on a pull request.

PR #126 passed on Ubuntu with the headless Chromium story suite. CI and desktop packaging share the toolchain setup. Cold-cache Storybook imports and the Question story click were stabilized, and the existing archive regression test caught a terminated process counted as active.