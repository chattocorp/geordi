#!/bin/sh
# Run Sweet Release against the current native workspace with a private Git index.
set -eu
root=$(jj workspace root)
cd "$root"
store=$(jj git root)
snapshot=$(jj log --no-graph -r @ -T commit_id)
mkdir -p .context
view=$(mktemp -d "$root/.context/sweet.XXXXXXXX")
trap 'rm -rf "$view"' EXIT
git init --quiet --bare "$view"
export GIT_DIR="$view" GIT_WORK_TREE="$root" GIT_ALTERNATE_OBJECT_DIRECTORIES="$store/objects"
git update-ref HEAD "$snapshot"
git read-tree "$snapshot"
sweet doctor
