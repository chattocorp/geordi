---
type: fix
---

When another program already uses one of your job's ports, Geordi no longer takes it for your job and opens that program from your links: the job doesn't start, its terminal says which port is in use and by what, and starting it, or opening a link that needs it, tells you so. New workspaces are also no longer given ports that something on `127.0.0.1` or `::1` already listens on.
