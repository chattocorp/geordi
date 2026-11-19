---
data:
  priority: normal
  status: done
  type: task
id: jfxkf
title: Build a macOS disk image
---
Build a local drag-to-install DMG and include it in desktop releases alongside the existing downloads.

Verified the Apple Silicon image checksum, Applications shortcut, app signature, and native terminal module from the mounted image. The release workflow signs and notarizes the DMG with its release credentials.

The 0.6.0 macOS job passed app verification, then hdiutil reported a busy resource during DMG creation. Packaging now retries that error up to twice. Tested recovery, persistent contention, and an unrelated error with a stubbed hdiutil.
