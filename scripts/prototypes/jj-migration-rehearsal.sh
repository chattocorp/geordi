#!/bin/sh
# Rehearse converting a trusted, idle, linked Git checkout into a private jj checkout.
# The candidate and its recovery files live under a fresh destination. Never publish.
set -eu
umask 077
fail() { echo "$*" >&2; exit 1; }
[ "$#" = 4 ] || fail "Usage: $0 LEGACY_CHECKOUT NEW_DIRECTORY BASE_BRANCH WORKTREE_UUID"
src=$(cd "$1" && pwd -P)
parent=$(cd "$(dirname "$2")" && pwd -P)
out="$parent/$(basename "$2")"
base=$3
id=$4
printf '%s\n' "$id" | grep -Eq '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' || fail "Invalid worktree UUID."
checkout="$out/workspaces/candidate/$(printf '%.8s' "$id")"
case "$out/" in "$src/"*) fail "Place the rehearsal outside the source checkout." ;; esac
[ -f "$src/.git" ] && [ ! -L "$src/.git" ] || fail "Expected a linked Git checkout."
export GIT_OPTIONAL_LOCKS=0
g() { git -C "$src" "$@"; }
[ "$(g rev-parse --is-shallow-repository)" = false ] || fail "Fetch the full history before rehearsal."
branch=$(g symbolic-ref --quiet --short HEAD) || fail "Detached HEAD needs manual recovery."
git check-ref-format "refs/heads/$base"
git check-ref-format "refs/heads/$branch"
upstream=$(g for-each-ref --format='%(upstream)' "refs/heads/$branch")
case "$upstream" in ""|"refs/remotes/origin/$branch") ;; *) fail "Review the upstream branch mapping first." ;; esac
head=$(g rev-parse HEAD)
basehead=$(g rev-parse --verify "refs/remotes/origin/$base" || g rev-parse --verify "refs/heads/$base")
origin=$(g remote get-url origin)
pushurl=$(g remote get-url --push origin)
for url in "$origin" "$pushurl"; do
    case "$url" in /*|*://*|*:*) ;; *) fail "Resolve relative remote URLs before rehearsal." ;; esac
done
for state in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_START rebase-merge rebase-apply sequencer; do
    [ ! -e "$(g rev-parse --path-format=absolute --git-path "$state")" ] || fail "Finish the Git operation first."
done
[ -z "$(g ls-files -u)" ] || fail "Resolve Git index conflicts first."
[ ! -e "$src/.jj" ] || fail "The source already has jj metadata."
mkdir "$out" || fail "Use a fresh destination."
find "$src" -mindepth 2 \( -name .git -o -name .jj \) -print > "$out/nested"
[ ! -s "$out/nested" ] || fail "Nested repositories need separate migration."
g ls-files -v > "$out/index-flags"
if grep -q '^[^H]' "$out/index-flags"; then fail "Special index entries need separate migration."; fi
g ls-files --stage > "$out/index-entries"
if grep -q '^160000 ' "$out/index-entries"; then fail "Submodules need separate migration."; fi
# Store a binary patch that can reconstruct the index apart from the on-disk files.
patch() { g diff --cached --no-ext-diff --no-textconv --binary --full-index --no-renames "$head" --; }
patch > "$out/staged.patch"
jj git init --no-colocate "$out/control"
j() { jj -R "$out/control" "$@"; }
store=$(j git root)
objects() { git --git-dir="$store" "$@"; }
objects fetch --no-tags "$src" "$head:refs/heads/$branch" "$basehead:refs/remotes/origin/$base"
# Retain the last fetched published head separately from any local-only commits.
if published=$(g rev-parse --verify --quiet "refs/remotes/origin/$branch"); then
    objects fetch --no-tags "$src" "$published:refs/remotes/origin/$branch"
fi
j git remote add origin "$origin" --push-url "$pushurl"
j git import
GIT_INDEX_FILE="$out/recovered.index"
export GIT_INDEX_FILE
objects read-tree "$head"
if [ -s "$out/staged.patch" ]; then objects apply --cached --binary "$out/staged.patch"; fi
objects ls-files --stage -z > "$out/recovered.entries"
unset GIT_INDEX_FILE
g ls-files --stage -z > "$out/source.entries"
cmp "$out/recovered.entries" "$out/source.entries" || fail "Could not reconstruct the Git index."
mkdir -p "$(dirname "$checkout")" "$out/control/.jj/geordi/publications"
j workspace add --name "ws-$id" -r "$head" "$checkout"
# Include ignored files, symlinks, modes and deletions in the candidate.
copy() { rsync -aH --delete --exclude='/.git' --exclude='/.jj' "$@" "$src/" "$checkout/"; }
copy
copy --dry-run --checksum --itemize-changes > "$out/differences"
[ ! -s "$out/differences" ] || fail "The candidate differs from the source."
[ "$(g symbolic-ref --short HEAD)" = "$branch" ] && [ "$(g rev-parse HEAD)" = "$head" ] || fail "The source branch moved."
patch > "$out/staged.after"
cmp "$out/staged.patch" "$out/staged.after" || fail "The source index changed."
[ "$(objects rev-parse "refs/heads/$branch")" = "$head" ] || fail "Publication bookmark mismatch."
printf '%s\n' "$branch" > "$out/control/.jj/geordi/publications/$id"
printf 'Candidate %s\nPublication %s at %s\nReview base %s at %s\nRecovered Git index %s\n' "$checkout" "$branch" "$head" "$base" "$basehead" "$out/recovered.index"
