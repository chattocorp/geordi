---
data:
  priority: high
  status: done
  tags:
    - forge
    - ui
  type: feature
id: bf44h
title: Pull request status from the upstream forge
---
ADR-006. The daemon talks to the forge a repository is hosted on through the `forges` library; the changes pane shows whether the workspace branch is pushed and its pull request (state, checks, reviews, target branch).

Outcome: implemented and verified against a real GitHub pull request. Follow-ups: acting upstream (open a pull request, merge) from the workspace; webhooks instead of polling.

Background refresh uses batched reads for known open pull requests. Verified two PRs in one GitHub request and sidebar recovery after a forge restart.
