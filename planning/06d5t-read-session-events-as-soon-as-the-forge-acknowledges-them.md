---
data:
  priority: normal
  status: done
  type: bug
id: 06d5t
title: Read session events as soon as the forge acknowledges them
---
Keep one event in flight, retry after a second, and persist progress only after receipt. Measure prompt acknowledgment across a burst.

A matching receipt wakes the session reader immediately. The 30-record journal test went from 3.2 seconds to about 110 ms with prompt receipts. Tests also verify the retry deadline and durable offset. In an isolated restart of the forge and daemon, the detached ACP fixture completed while both were offline. Its reply and completion appeared once, in order, and the final offset matched the journal length.