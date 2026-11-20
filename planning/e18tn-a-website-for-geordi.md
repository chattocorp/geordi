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
- Hosted at https://geordi.run as a Cloudflare Worker with static assets (`apps/website/wrangler.jsonc`), deployed by `.github/workflows/website.yml` after stable desktop publication (secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- Stable desktop publications trigger deployment. You can also run the Website workflow manually to redeploy the latest stable tag. The browser reads GitHub Releases to show the stable version and any beta for a newer version. The stable download link works without JavaScript.
- Shared links include a 1200 × 630 workspace preview with the download address.
- The homepage introduces agent review in the hero and omits the fictional conversation and after-quit activity feed.
- The configuration example uses a default web task with a command, a URL, and a database dependency (f5yky).
- The shortcut list and demo settings row use the shared keycaps with Mac modifiers.
