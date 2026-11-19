---
data:
  priority: normal
  status: done
  type: feature
id: k84fj
title: Share the reply composer with the website demo
---
Use the forge reply composer and its idle and working controls in the demo. Keep submissions local and preserve forge forms and image handling.

Both apps use ReplyComposer from @geordi/ui (ADR-011). The forge supplies form fields, attachments, and harness controls. The website handles replies locally. Verified keyboard and button submission, queued delivery, stopping and replay, mobile reduced motion, and static HTML in Chromium. Forge stories cover focus, completions and image uploads. Production builds and repository checks passed.