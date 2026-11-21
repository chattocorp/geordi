---
data:
  priority: high
  status: todo
  type: bug
id: 62tva
title: Isolate the daemon when the CLI uses a separate data directory
---
The data-directory lock recommends GEORDI_DATA_DIR for a second instance. Even on separate ports, only the forge moves. The daemon still defaults its session lock and token to ~/.geordi. Make the combined launcher derive local daemon defaults from the selected directory and preserve explicit daemon overrides. Verify two instances on separate ports can work independently.