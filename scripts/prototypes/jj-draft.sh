#!/bin/sh
# Run from the root of a Geordi worktree. The caller owns publication.
set -eu

fail() { echo "$*" >&2; exit 1; }
usage() { fail "Usage: $0 snapshot PATH... | restack OLD_PARENT NEW_PARENT"; }
[ "$(git rev-parse --show-prefix)" = "" ] || fail "Run from the worktree root."
mkdir -p .context
scratch=$(mktemp -d "$PWD/.context/jj-draft.XXXXXXXX")
trap 'rm -rf "$scratch"' EXIT

case ${1:-} in
snapshot)
    shift
    [ "$#" -gt 0 ] || usage
    # Only the named paths enter the draft. Leave the person's index and branch alone.
    export GIT_INDEX_FILE="$scratch/index"
    base=$(git rev-parse HEAD)
    git read-tree "$base"
    git --literal-pathspecs add -A -- "$@"
    tree=$(git write-tree)
    git commit-tree "$tree" -p "$base" -m "${GEORDI_DRAFT_MESSAGE:-chore: snapshot parent draft}"
    ;;
restack)
    [ "$#" -eq 3 ] || usage
    old=$(git rev-parse --verify --end-of-options "$2^{commit}")
    new=$(git rev-parse --verify --end-of-options "$3^{commit}")
    branch=$(git symbolic-ref --short HEAD) || fail "Check out the child's branch first."
    head=$(git rev-parse HEAD)
    git merge-base --is-ancestor "$old" "$head" || fail "Old parent is outside the child history."
    [ "$old" != "$head" ] || fail "Commit the child's first change before restacking."
    [ -z "$(git rev-list --merges "$old..$head")" ] || fail "This prototype handles linear child branches."
    git diff --cached --quiet || fail "Commit or unstage indexed edits before restacking."

    # Rewrite in a private repo. The live workspace stays on its named Git branch.
    repo="$scratch/rewrite"
    git init -q -b scratch "$repo"
    git -C "$repo" fetch -q --no-tags "$PWD" "$head:refs/heads/child" "$new:refs/heads/parent"
    jj git init --colocate "$repo" >&2
    jj -R "$repo" rebase -r "$old..$head" -o "$new" >&2
    conflicts=$(jj -R "$repo" log --no-graph -r 'conflicts() & (parent..child)' -T 'commit_id')
    [ -z "$conflicts" ] || fail "Restack conflicts with the parent. Child branch and files are intact."
    tip=$(git -C "$repo" rev-parse refs/heads/child)
    git -C "$repo" merge-base --is-ancestor "$new" "$tip" ||
        fail "The rewritten child does not descend from the revised parent."
    git fetch -q --no-tags --no-write-fetch-head "$repo" "$tip"
    [ "$(git symbolic-ref --short HEAD)" = "$branch" ] && [ "$(git rev-parse HEAD)" = "$head" ] ||
        fail "Child branch moved during the restack."
    # Keep unstaged edits. Git refuses if refreshing a file would overwrite one.
    git reset --keep "$tip"
    ;;
*) usage ;;
esac
