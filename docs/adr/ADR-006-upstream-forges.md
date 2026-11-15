# ADR-006: Upstream forges through `forges`, from the daemon

**Date:** 2026-11-14

## Context

Until Geordi is a forge of its own, the repositories it works on are hosted elsewhere: GitHub today, others tomorrow. A workspace's work ends up as a pull request there, and people want to see how it stands (pushed? open? checks? reviews?) without leaving the workspace. Later, Geordi will also need to act there: open pull requests, comment, merge.

Two questions follow: how to talk to several forges without writing a client for each, and which part of Geordi does the talking.

## Decision

- Geordi talks to upstream forges through [`forges`](https://forges.link), a TypeScript library with one normalised data model and a provider per forge (GitHub, GitLab, Forgejo, Gitea, Bitbucket and more). Supporting another forge should be configuration, not code.
- The **daemon** does the talking, not the forge. It is on the machine with the repository, so it knows the remotes, whether a branch has been pushed, and already has the user's credentials. A repository's upstream is its `origin` remote.
- Credentials come from the daemon's environment in the library's own convention (`FORGES_GITHUB_TOKEN`, `FORGES_GITLAB_TOKEN`, …). For github.com without one, the daemon uses the GitHub CLI's login if there is one, and otherwise asks anonymously, which works for public repositories.
- Upstream state is live data in the sense of ADR-003: the forge asks the daemon when someone looks, and nothing is stored. The daemon reuses an answer for a minute (five when anonymous), and asks the upstream forge nothing while a branch hasn't been pushed.

## Consequences

- One code path for every forge the library supports; what a forge can't do shows up as a capability, not a special case.
- No forge tokens in Geordi's own forge or event log, and nothing to configure on a machine where `gh` is signed in.
- Upstream state needs a connected daemon, like changes and terminals.
- The library has no way to ask for a branch's pull request. We search for it where the forge's search understands `head:<branch>` (GitHub) and otherwise scan the most recent pull requests, which is slower and can miss an old one.
- `forges` is young (0.x). Its API may change under us.
- Polling means a pull request's state can be up to a minute old. Webhooks would fix that, and would need the forge to be reachable from outside.
- Geordi also acts upstream where no judgement is needed: it merges a workspace's pull request itself (FDR-003), through the same library and credentials. That needs a token that may write; an anonymous connection can only look.
