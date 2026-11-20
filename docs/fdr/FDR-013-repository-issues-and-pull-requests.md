# FDR-013: Repository issues and pull requests

**Status:** Withdrawn
**Last reviewed:** 2026-11-20

## Withdrawn

The repository lists were removed while the design is reconsidered. Selecting a repository header now folds or expands its workspaces.

## Prior design

Open a repository to see work on its upstream forge and choose what to work on next.

## Behavior

- Select a repository name in the sidebar or in Settings → Repositories. The chevron beside a sidebar name folds its workspaces.
- The page opens on Pull requests. Each tab lists open items by most recent update. Select a title to open the item upstream.
- Pull requests show their draft or review status when available. Open workspace takes you to the workspace associated with a pull request.
- On an issue, Start workspace opens the composer with the repository selected and the issue title and URL filled in. You can edit the request and choose an agent before sending it.

## Design decisions

1. Keep the lists at repository level so you can find work before you create a workspace.
2. Read issues and pull requests from the repository’s upstream forge (ADR-006). Comments and reviews stay with the original conversation there.

## Related

- ADR-006, FDR-001, FDR-003
