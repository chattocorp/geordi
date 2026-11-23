---
data:
  priority: high
  status: todo
  tags:
    - repos
  type: feature
id: k6wt2
title: Discover and browse local repositories
---
Discover Git repositories under a configured root directory and list them in the UI. Browse files, commits, and branches of a repository.

## Acceptance criteria

- Repo root is configurable
- Repository list page
- Repository detail page with file tree and recent commits

## Note (ADR-013)

Geordi is heading towards a hosted forge with runner daemons on several machines (ADR-013). Discovery is fine as a way to *add* repositories, but keep a repository's identity its ID, not its local path: don't make anything new depend on forge and daemon sharing a disk. Browsing files and commits should go through the daemon (`hub().request`), as everything that reads a worktree does now.