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
shared revision graph from the control workspace. Its Changes pane compares snapshotted
revisions. Run `jj status` to capture edits. Reading the diff leaves agent files alone.

## Recovery and checks

The control repository, workspace metadata, sessions and forge events must persist across
daemon restarts. Archive parks the entire child directory alongside its original location
and leaves its working-copy revision registered in jj. Restore moves the directory back.
This preserves unpublished and unsnapshotted edits, including ignored files, and retains
the disk space. It does not exercise reconstructing a lost checkout.

Use the repository's ordinary build and test commands in the native directory. For this
repository's release check, run `scripts/prototypes/jj-sweet-doctor.sh` from a native
workspace. It snapshots the checkout and runs Sweet Release with a temporary bare Git
directory and private index backed by jj's objects.

The trial covers agent launch, revision-based changes and diffs, PR lookup, restart,
archive and restore. Terminals, setup jobs, file watching, per-turn patches, release-note
editing, merged-branch detection and migration of existing Git workspaces still need
implementation. Agents in the trial ran with full access. Sandboxed writes to a shared
jj store need their own design before enabling this backend by default.
