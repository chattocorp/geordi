---
data:
  priority: normal
  status: done
  type: feature
id: g88mj
title: Reference repository files with @ in messages
---
The daemon streams Git names into a reusable worker index and returns at most 40 paths with their fuzzy-match positions. The browser shows each name and folder on one row. Verified keyboard selection through the forge, the packaged worker, refresh after adding a file, and reuse after reconnecting the forge.

The composer starts searching after a filename character follows @ and typing pauses for 150 ms. It keeps the previous rows in place until the new results arrive. A browser story verifies that a bare @ sends no request and that pending rows cannot insert a stale path.

Million-file benchmark (local macOS, Node 26.9.0, warm medians of seven timed requests over the authenticated daemon WebSocket, excluding the browser debounce and rendering):

- Checked-out Git worktree made by repeating repository paths in numbered package directories. Cold first lookup took 22.9 s. Warm queries took 0.82 ms for m, 0.52 ms for msgcomp, 16.55 ms for pkg1740/comp, and 3.37 ms for a miss. The msgcomp response was 4,300 bytes including the envelope. An unrelated daemon request during the cold build took 0.60 ms. Before incremental updates, refreshing after adding a file took 17.4 s.
- Separate Git revision with a unique numbered suffix on each basename, one million paths. Cold first lookup took 15.4 s. Warm queries took 9.67 ms for m, 26.55 ms for msgcomp, 91.67 ms for pkg1740/comp, and 19.08 ms for a miss. These timings include resolving the starting revision.

Incremental updates on a one-million-file checkout (macOS, Node 26.9.0). The existing recursive watcher batches paths for 25 ms. The daemon reconciles those paths with Git on the next search. A root ignore-rule change, an unnamed event, or (before the burst handling described below) more than 128 changed paths triggers a full reconciliation.

- Created a temporary Git checkout by repeating this repository’s tracked paths in numbered directories, with exactly one million empty tracked files. The first daemon search took 14.4 s. Reconnected the forge and verified that the warm search still worked.
- In seven rounds, created an untracked file under pkg0, renamed it in place, and deleted it. Timed each filesystem operation through the first correct authenticated daemon WebSocket response, searching at 10 ms intervals between replies. The rename check required the old path to disappear and the new path to appear. Median add, rename and delete times were 135.71 ms, 137.99 ms and 132.94 ms respectively.
- Four tracked moves using git mv became visible 284–303 ms after Git returned. Regression tests also cover index-only force-add and unstage, directory moves, file/directory replacement, ignore rules, and promotion of the next same-named match after deletion.

First lookup after a daemon restart on a real linked Git worktree with one million tracked files. The fixture repeated this repository’s paths in numbered directories and included two untracked probe files. Measurements used the staged CLI daemon with its npm-installed native dependencies on an Apple M4 Max, macOS 27.0.1, Node 26.9.0 and Git 2.55.0.

- Timed the authenticated WebSocket request through the first reply after the daemon connected. The benchmark kept the OS file cache warm and killed the daemon between runs. Process launch, browser debounce and rendering are outside these timings.
- With no checkpoint, the first msgcomp lookup took 14.38 s and wrote 49,768,236 bytes. Across five unchanged restarts the first lookup returned the same 40 paths and highlights in a median of 589.53 ms (561–629 ms). A subsequent lookup in the same process took a median of 1.03 ms.
- Across five more restarts, each with an offline add, rename and delete, the first lookup for zzrestart took a median of 740.70 ms (732–797 ms). Each reply contained exactly the two surviving paths.

Ignored-output burst benchmark on the same fixture layout with one million tracked files, macOS on Apple M4 Max and Node 26.9.0. Each round created 2,048 new ignored files across 64 directories. After the daemon’s worktree-change notification, the client timed its first authenticated findFiles request for msgcomp and verified all 40 paths and their highlight offsets. It also searched for the ignored output and verified that no paths were returned.

| Median | Previous daemon (3 rounds) | Updated daemon (7 rounds) |
| --- | --- | --- |
| First lookup after ignored changes | 16.15 s | 162.73 ms |
| First lookup with a visible edit in the same burst | 16.14 s | 187.17 ms |
| Subsequent lookup after ignored changes | 0.83 ms | 0.64 ms |

The updates keep a bounded set of changed paths and combine related paths into directory checks. Git still decides which paths are visible. The ignored-only first lookup ranged from 156.56 to 171.58 ms. Timing from the last filesystem write through the notification and first reply gave a median of 459.79 ms. The mixed run verified that the new visible name appeared, and that the previous round’s name disappeared. On Linux and Windows, a cold worktree search now goes straight to Git, avoiding Parcel’s portable full-tree crawl. Commit indexes still use checkpoints on all platforms.
