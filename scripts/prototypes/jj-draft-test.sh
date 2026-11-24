#!/bin/sh
# Run directly with Git and jj on PATH.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$here/../../.context"
scratch=$(mktemp -d "$here/../../.context/jj-draft-test.XXXXXXXX")
trap 'rm -rf "$scratch"' EXIT
helper="$here/jj-draft.sh"

assert_equal() {
    if [ "$1" != "$2" ]; then
        printf '%s\nExpected: %s\nActual:   %s\n' "$3" "$1" "$2" >&2
        exit 1
    fi
}

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git init -q -b main "$scratch"
cd "$scratch"
git config user.name 'Draft test'
git config user.email 'draft-test@example.com'

printf 'base\n' > parent.txt
printf 'base\n' > unrelated.txt
git add parent.txt unrelated.txt
git commit -qm 'Base'
base=$(git rev-parse HEAD)

printf 'staged parent\n' > parent.txt
printf 'staged unrelated\n' > unrelated.txt
git add parent.txt unrelated.txt
index=$(git write-tree)
printf 'first parent draft\n' > parent.txt

old_parent=$("$helper" snapshot parent.txt)
assert_equal "$base" "$(git rev-parse HEAD)" 'Snapshot keeps the branch tip'
assert_equal "$index" "$(git write-tree)" 'Snapshot keeps the original index'
assert_equal 'first parent draft' "$(cat parent.txt)" 'Snapshot keeps working tree content'
assert_equal "$base" "$(git rev-parse "$old_parent^")" 'Snapshot starts from HEAD'
assert_equal 'parent.txt' "$(git diff --name-only "$base" "$old_parent")" 'Snapshot includes only the selected path'
assert_equal 'first parent draft' "$(git show "$old_parent:parent.txt")" 'Snapshot takes content from the working tree'

printf 'revised parent draft\n' > parent.txt
printf 'parent-only addition\n' > parent-only.txt
new_parent=$("$helper" snapshot parent.txt parent-only.txt)

git reset -q --hard "$base"
rm parent-only.txt
git switch -qc child "$old_parent"
printf 'committed child edit\n' > child.txt
git add child.txt
git commit -qm 'Child edit'
printf 'uncommitted child edit\n' >> child.txt

"$helper" restack "$old_parent" "$new_parent"
assert_equal child "$(git branch --show-current)" 'Restack keeps the child branch checked out'
assert_equal "$new_parent" "$(git rev-parse HEAD^)" 'Restack puts the child commit on the revised draft'
assert_equal 'child.txt' "$(git diff --name-only "$new_parent" HEAD)" 'Restacked commit contains only the child change'
assert_equal 'revised parent draft' "$(cat parent.txt)" 'Restack updates the parent file'
assert_equal 'parent-only addition' "$(cat parent-only.txt)" 'Restack adds the parent-only file'
assert_equal 'committed child edit' "$(git show HEAD:child.txt)" 'Restack preserves the committed child edit'
assert_equal "$(printf 'committed child edit\nuncommitted child edit\n')" "$(cat child.txt)" 'Restack preserves the uncommitted child edit'
assert_equal ' M child.txt' "$(git status --porcelain --untracked-files=no)" 'The remaining child edit is unstaged'

printf 'Snapshot and restack passed.\n'
