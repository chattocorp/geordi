---
type: fix
---

Geordi now starts even if one of your stored events can no longer be read: it logs the event and carries on, where before it could fail to start until the event was removed.
