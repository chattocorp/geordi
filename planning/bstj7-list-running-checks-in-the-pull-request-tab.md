---
data:
  priority: normal
  status: done
  type: feature
id: bstj7
title: List running checks in the pull request tab
---
Show each check on the current pull request, with failed and active jobs first and links to individual runs.

Verified the status order, queued jobs, collapsed results, keyboard controls, and a narrow PR pane in Chromium.

Other checks, plan cards, tool groups, and individual tool calls now share the Disclosure component. Verified nested sections with pointer and keyboard input.

The checks bar now provides the summary on hover and to screen readers. Verified the collapsed card and expanded result for one passing check in Chromium.

Long lists scroll below the checks summary. Yellow icons pulse when motion is enabled. Running checks show elapsed time when the forge supplies a start time.

The Checks list starts collapsed and remembers the last choice across pull requests in this browser. Both open and closed states survived a reload in Chromium.

The full Checks summary toggles the list, including its status bar and padding. The forge link has its own click target.

Completed checks show their recorded duration. Rows without timing data leave the time column empty. The status remains available to screen readers. Verified in the pull request stories.

The checks bar hides immediately when you switch tabs. Verified inherited visibility in Chromium while a check was running.
