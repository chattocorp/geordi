---
data:
  priority: normal
  status: todo
  tags:
    - agents
  type: bug
id: cdwza
title: Start the daemon hub at forge startup
---
SvelteKit runs the `init` hook only before the first request, so daemons can't connect until someone opens the forge. Start the WebSocket server at process start instead (e.g. a custom adapter-node server, or a Vite plugin in dev).