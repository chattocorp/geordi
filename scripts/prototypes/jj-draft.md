# A child agent on a parent draft

This agent-operated prototype uses Geordi's existing branch, diff and pull request handling.
The parent and child each keep a normal Geordi Git worktree. Jujutsu rewrites the child
commits in a temporary repository. Invoke the script from the root of the relevant worktree.
The restack was tested with jj 0.45.1.

1. In the parent, run `old=$(scripts/prototypes/jj-draft.sh snapshot path/to/draft)`.
   This records the selected files on top of HEAD and prints the commit ID. Other edits,
   the Git index, and the current branch stay in place. Publish that ID to a new branch
   reserved for this draft, e.g. `git push origin "${old}:refs/heads/DRAFT"` (replace
   `DRAFT` with your draft branch name). Save the ID for the child.
2. Call Geordi's `start_agent` with `worktree: "own"` and `base` set to the draft branch.
   Have the child commit its work, push its own branch and open a PR **against the draft
   branch**. Geordi compares the child with that target.
3. Revise the parent files. From the same parent HEAD, take a new snapshot of the full
   draft file set. Publish it to the same branch with an explicit lease,
   `git push --force-with-lease="refs/heads/DRAFT:$old" origin "${new}:refs/heads/DRAFT"`.
4. At the child's next turn, fetch the new parent and save the current remote child tip.
   Run `scripts/prototypes/jj-draft.sh restack "$old" "$new"` in the child worktree.
   Review the diff and push HEAD to the same child branch using an explicit lease against
   the saved remote tip. The PR keeps its head and base branch names.

The child must have a linear series of commits and an unstaged or clean index. Run the
refresh while the child owns its files. A conflict in the committed series stops the
refresh before it touches the live branch. Git also refuses to replace tracked, unstaged
edits that overlap a checkout update. A failed lease requires inspecting the remote changes
before retrying.
