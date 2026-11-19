---
data:
  priority: normal
  status: done
  type: feature
id: qae71
title: 'Projects: workspaces for orchestrating, in no repository'
---
Workspaces that belong to no repository, for orchestrating agents across repositories, or for work that belongs to no branch. Design: FDR-012. PR #201.

## Acceptance criteria

- A project is started from the New workspace page's repository chooser (New project) and listed in a Projects section above the repositories.
- Its agent works in a folder of its own, kept when the project is archived; pictures there show in its replies.
- Its agent starts agents in any repository, or alongside any workspace's agent there, and supervises and archives any agent in a repository or in its own project.
- Projects can't see or touch each other.

## Outcome

Done on the branch of PR #201: forge, daemon, protocol, UI, tests, FDR-012 and CLAUDE.md.
