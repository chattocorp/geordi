---
type: fix
---

Geordi no longer lets a second copy of itself run on the same data, for example `npx geordi` on another port while the app is open. The second one stops at once and says why, instead of quietly mixing up both histories.
