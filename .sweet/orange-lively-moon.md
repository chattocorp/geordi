---
type: fix
---

The workspace checks for a new pull request as soon as an agent finishes a turn, even while an earlier refresh is running. A temporary lookup failure keeps the last known pull request visible for the same branch.
