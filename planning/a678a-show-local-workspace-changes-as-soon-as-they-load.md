---
data:
  priority: normal
  status: done
  type: task
id: a678a
title: Show local workspace changes as soon as they load
---
The forge publishes local Git, configuration, and release results independently. It publishes standing once Git and upstream have answered. Edits during a refresh trigger a single catch-up pass.

Verified in Chromium with a nine-second upstream delay. The diff rendered and a shell command ran before the lookup finished. Restarting the forge restored the changes and the running terminal.