---
data:
  priority: normal
  status: done
  type: feature
id: fnxrh
title: Distinguish incoming agent messages in conversations
---
Consecutive messages from the same child share a collapsed row. The latest message determines the heading. Expanding it shows the exchange in order, with attachments and the child workspace link. Tests cover sender boundaries, intervening replies, and queued messages (FDR-002).