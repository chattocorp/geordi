---
data:
  priority: normal
  status: done
  type: feature
id: 0pphe
title: Use the forge diff viewer for selected demo files
---
Share DiffView between the forge and website, render the selected sample file from its before and after contents, and preserve the initial static preview.

The forge, tool patches, and selected demo files use DiffView from @geordi/ui (ADR-011). Verified all three sample files, a rapid switch during a delayed first load, dark mode, static HTML and deferred loading in Chromium. Both production builds and repository checks passed.