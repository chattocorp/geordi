---
data:
  priority: normal
  status: done
  type: feature
id: 03wjd
title: Paste and add images to agent messages
---
Implemented file selection and clipboard image paste in new and existing conversations, including agents working alongside another. Previews can be removed before sending; sent and queued images open at full size. Each message accepts up to four PNG, JPEG, WebP or GIF images, at most 5 MiB each. Image bytes are stored once in image events; message events and live views carry IDs. Claude receives native image blocks over file-backed stdin; Codex receives private image files with --image. Queue, steering, image-only messages and restart recovery preserve attachments.

Verified with pnpm check, pnpm lint, pnpm test (350 tests), sweet doctor and a production build. Browser interaction tests cover paste, selection, removal, failed uploads and reset. An isolated production browser smoke test sent a 1 MiB PNG through a first message and a queued message to a test daemon, checked the original bytes, and restored sent and queued images after a forge process restart. Upload checks reject foreign origins, unsupported content and oversized payloads. Daemon tests detach and reconnect a running turn with image files and stdin. Actual model responses were not exercised.

Documented behavior and retention tradeoffs in FDR-001; added a feature release note.