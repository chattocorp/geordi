---
data:
  priority: normal
  status: done
  type: feature
id: h2f66
title: Check upstream forge access from repository settings
---
Let people check the daemon's forge configuration and read access for a registered repository independently of workspace state. See 0952p.

Outcome: each repository in Settings is a row like a provider's (picture, name, one status line underneath, workspace count), checked automatically when the page is shown. The status line names the host and whether the daemon signed in or read anonymously, or says what is wrong (no forge set up for the host, denied, not visible, unreachable, rate limited). Unfolding a row (`RepositoryRow.svelte`) shows the directory, the origin with credentials removed, the kind of forge and how the daemon signs in, and any problem with a link to the setup guide, beside Check again and Remove. Local origins read as neutral. Nothing shown carries credentials or the forge's error text. Earlier designs (an inline check button, a details-only accordion, a bare status line) were rejected or superseded. Tests cover missing and local origins, an unknown host with credentials in its URL, a Forgejo 404 with sensitive error text, and a successful read. Verified in the dev app, light and dark, with unknown, local and GitHub origins.