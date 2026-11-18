---
data:
  priority: normal
  status: done
  type: feature
id: e18tn
title: A website for Geordi
---
A public website that says what Geordi is and leads to the download.

## Outcome

- `apps/website`: a static Astro site with one page (hero with a self-playing workspace, features, opinions, install).
- It is drawn with the forge's design system: `src/styles/site.css` imports `apps/web/src/routes/layout.css` and adds only two headline sizes and a few utilities.
- The demo window (`Demo.astro`) is markup and a small inline script, no framework. Without scripts or with reduced motion it shows its last step.
- Run it from a workspace with the `website` job; build with `pnpm --filter @geordi/website build` (to `apps/website/dist`).

## Open

- Where it is hosted, and under which domain (no deployment yet; `site` is not set in `astro.config.mjs`).
- A social preview image.
