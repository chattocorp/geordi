---
type: fix
---

Electron apps that your agents start, such as a desktop app they are working on, now open as apps. Before, they started as plain Node and quit at once, because the agents had inherited a setting meant for Geordi itself.
