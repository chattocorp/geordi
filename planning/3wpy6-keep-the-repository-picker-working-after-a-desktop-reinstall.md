---
data:
  priority: high
  status: done
  type: bug
id: 3wpy6
title: Keep the repository picker working after a desktop reinstall
---
The macOS installer now includes its ancestors when checking whether Geordi is running. A workspace install waits for the app to quit before moving its bundle. Verified the process check against the running app and opened the native folder picker from Settings in the isolated Electron app.