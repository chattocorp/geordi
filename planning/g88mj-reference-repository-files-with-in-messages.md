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

- Checked-out Git worktree made by repeating repository paths in numbered package directories. Cold first lookup took 22.9 s. Warm queries took 0.82 ms for m, 0.52 ms for msgcomp, 16.55 ms for pkg1740/comp, and 3.37 ms for a miss. The msgcomp response was 4,300 bytes including the envelope. An unrelated daemon request during the cold build took 0.60 ms. Before incremental updates, refreshing after adding a file took 17.4 s.
- Separate Git revision with a unique numbered suffix on each basename, one million paths. Cold first lookup took 15.4 s. Warm queries took 9.67 ms for m, 26.55 ms for msgcomp, 91.67 ms for pkg1740/comp, and 19.08 ms for a miss. These timings include resolving the starting revision.

Incremental updates on a one-million-file checkout (macOS, Node 26.9.0). The existing recursive watcher batches paths for 25 ms. The daemon reconciles those paths with Git on the next search. A root ignore-rule change, an unnamed event, or more than 128 changed paths triggers a full reconciliation.

- Created a temporary Git checkout by repeating this repository’s tracked paths in numbered directories, with exactly one million empty tracked files. The first daemon search took 14.4 s. Reconnected the forge and verified that the warm search still worked.
- In seven rounds, created an untracked file under pkg0, renamed it in place, and deleted it. Timed each filesystem operation through the first correct authenticated daemon WebSocket response, searching at 10 ms intervals between replies. The rename check required the old path to disappear and the new path to appear. Median add, rename and delete times were 135.71 ms, 137.99 ms and 132.94 ms respectively.
- Four tracked moves using git mv became visible 284–303 ms after Git returned. Regression tests also cover index-only force-add and unstage, directory moves, file/directory replacement, ignore rules, and promotion of the next same-named match after deletion.