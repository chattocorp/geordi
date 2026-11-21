---
data:
  priority: high
  status: done
  type: bug
id: 62tva
title: Isolate the daemon when the CLI uses a separate data directory
---
The data-directory lock recommends GEORDI_DATA_DIR for a second instance. Even on separate ports, only the forge moves. The daemon still defaults its session lock and token to ~/.geordi. Make the combined launcher derive local daemon defaults from the selected directory and preserve explicit daemon overrides. Verify two instances on separate ports can work independently.

The CLI derives all six daemon paths from its data directory and respects explicit overrides. Tested two staged CLI instances on separate ports with separate relative data directories. Both authenticated with distinct identities and tokens. Restarting one preserved its identity while the other stayed online.