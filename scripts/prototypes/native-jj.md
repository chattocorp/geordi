# Native jj daemon trial

The daemon can run agents for one selected repository in non-colocated Jujutsu workspaces.
The trial used jj 0.45.1. Start an isolated development forge and daemon with their own
data, sessions and ports. Register the usual source repository with that forge. Before
starting the daemon, prepare a separate non-colocated control workspace from the same
upstream and set these daemon environment variables:

```sh
jj git clone --no-colocate "$upstream" "$control"
export GEORDI_JJ_SOURCE="$registered_repository_absolute_path"
export GEORDI_JJ_CONTROL="$control"
```

The daemon creates each checkout with `jj workspace add`. In the parent agent, edit a
file, describe the working-copy revision, and set the assigned publication bookmark on
`@`. Start a child with that bookmark as its base. A local bookmark suffices to start the
child. Push both bookmarks when opening a stacked PR, with the parent's bookmark as its
base. Running `jj new` in the child after publication gives it a separate revision for
local-only edits.

To revise the parent, amend the change the child actually descends from. Creating a new
sibling commit does not restack the child. At the child's next turn, refresh the stale
workspace, review the diff and push the rewritten child bookmark. The daemon reads the
shared revision graph from the control workspace. While Changes is open, filesystem notifications refresh its comparison against the
review base. Ordinary file edits, additions and deletions appear before the agent runs a
jj command. A private, temporary index reads the files without moving the working-copy
revision or publication bookmark.

## Recovery and checks

Archive stops the idle agent session, captures the tracked files and non-ignored new
files, and verifies their tree against a recovery revision in the control repository.
A private jj workspace reference keeps that revision reachable across daemon restarts.
Archive removes both the agent checkout and the temporary recovery checkout. Ignored
build output and scratch files are discarded.

Restore creates a fresh native workspace, checks out the saved working-copy revision,
reapplies its unsnapshotted edits, and verifies the resulting tree before releasing the
recovery reference. If the saved revision has become immutable, jj starts a fresh change
on it. A workspace parked by the earlier prototype can still be restored.

Use the repository's ordinary build and test commands in the native directory. For this
repository's release check, run `scripts/prototypes/jj-sweet-doctor.sh` from a native
workspace. It snapshots the checkout and runs Sweet Release with a temporary bare Git
directory and private index backed by jj's objects.

The trial covers agent launch, live changes and diffs, PR lookup, restart,
archive and restore. Terminals, setup jobs, per-turn patches, release-note
editing, merged-branch detection and migration of existing Git workspaces still need
implementation. Agents in the trial ran with full access. Sandboxed writes to a shared
jj store need their own design before enabling this backend by default.

## Rehearsing a Git worktree migration

From a trusted, idle test checkout, use a fresh destination outside the source. Supply
the actual PR base and the checkout owner's full workspace ID. Agents that share the
checkout use the same owner. The rehearsal requires Git, jj and rsync.

```sh
scripts/prototypes/jj-migration-rehearsal.sh "$legacy_checkout" "$new_directory" "$pr_base_branch" "$worktree_id"
```

The destination contains an independent control repository and a native candidate under
`workspaces/candidate/`. The script imports the local HEAD, the last fetched publication
tip and the review base independently. It records the original branch name in the
control workspace. The daemon uses that name for Changes, agent instructions, archive,
restore and upstream PR lookup. A renamed branch can therefore keep its PR while its
local tip has unpublished commits. The source checkout and upstream refs stay in place.

The rehearsal copies tracked, untracked and ignored files. A checksum pass compares
file contents, symlink targets, ordinary modes and deletions. The binary staged patch
and a reconstructed Git index live beside the candidate. Git's staged version may
differ from both HEAD and the working file. For example, to read its exact bytes:

```sh
GIT_INDEX_FILE="$new_directory/recovered.index" git --git-dir="$(jj -R "$new_directory/control" git root)" show ":$file"
```

The native working copy presents the on-disk version. Keep the index and patch with
the migration backup until the owner has reconciled their staged changes. The script
does not perform a live cutover. Detached HEADs, in-progress merges or rebases,
submodules, nested repositories, shallow history and mismatched upstream branch
names require separate handling. Stashes, reflogs, hooks, worktree-specific Git
configuration and filesystem ACLs stay with the original Git repository.

## Rollout and rollback

1. Record the backend on the checkout owner's creation event. Old events must resolve
   to Git, including archived owners with no directory. Aides inherit the owner's
   backend. Persist a migration event only after the candidate passes verification.
2. Before making jj the creation default, provision one trusted control store per
   registered repository, verify jj availability in packaged installs, and exercise
   sandboxed agent writes, setup jobs, terminals, release tools and PR actions. Today
   the native turn path skips setup and passes no writable shared-store root to a
   sandboxed agent. Several daemon requests still reject native workspaces.
3. For a cutover, stop all writers, including terminals, tasks and agents sharing
   the checkout. Capture the existing remote, branch, local HEAD, PR head/base and
   the exact staged and working contents under an owner lock. A missing checkout
   needs its legacy archive/branch inspected before conversion. Refuse ambiguous
   cases and keep the owner on Git.
4. Compare the Git and native Changes lists and diffs against the PR base. Account
   for excludes from Git configuration or `info/exclude` that a new store does not
   inherit. Look up the existing PR through Geordi and compare repository, number,
   head and base. Journal the verified candidate. Park the original with
   `git worktree move` and install the candidate at the owner's path. Test interruption
   before and after each step, including forge and daemon restart. An incomplete cutover must resume or return to the original checkout.
5. Rollback before new edits can restore the parked Git worktree and its original
   index. After editing resumes, preserve the jj history and working files and
   reconcile them into a separate Git candidate before switching back. Keep both
   copies until the owner verifies the result.
