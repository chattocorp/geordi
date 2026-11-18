---
data:
  priority: high
  status: done
  type: task
id: 5vzw6
title: Scale forge replay and live conversations
---
Scope workspace wakeups, send transcript edits, store image bytes beside SQLite, and rebuild archived transcripts on demand. Verify compatibility, restart, and measure the production forge on a copy of the installed database.

The forge now sends ordered transcript edits and rebuilds archived conversations on demand. New image uploads use content-addressed blobs. Both projections filter event types before parsing rows. Verified restart equivalence on a 19,631-event database copy, plus old inline images and legacy sessions in tests. Five paired production starts reduced median time to the first navigation value from 286 to 193 ms, RSS from 266.9 to 106.7 MiB, and one tool update from 506,394 to 1,015 payload bytes.