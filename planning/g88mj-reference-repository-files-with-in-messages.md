---
data:
  priority: normal
  status: done
  type: feature
id: g88mj
title: Reference repository files with @ in messages
---
The daemon streams Git names into a reusable worker index and returns at most 40 paths with their fuzzy-match positions. The browser shows each name and folder on one row. Verified keyboard selection through the forge, the packaged worker, refresh after adding a file, and reuse after reconnecting the forge.

Million-file benchmark (local macOS, Node 26.9.0, warm medians of seven timed requests over the authenticated daemon WebSocket, excluding the browser debounce and rendering):

- Checked-out Git worktree made by repeating repository paths in numbered package directories. Cold first lookup took 22.9 s. Warm queries took 0.82 ms for m, 0.52 ms for msgcomp, 16.55 ms for pkg1740/comp, and 3.37 ms for a miss. The msgcomp response was 4,300 bytes including the envelope. An unrelated daemon request during the cold build took 0.60 ms. Refresh after adding a file took 17.4 s.
- Separate Git revision with a unique numbered suffix on each basename, one million paths. Cold first lookup took 15.4 s. Warm queries took 9.67 ms for m, 26.55 ms for msgcomp, 91.67 ms for pkg1740/comp, and 19.08 ms for a miss. These timings include resolving the starting revision.