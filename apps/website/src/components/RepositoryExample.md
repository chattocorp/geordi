```yaml
setup: pnpm install

jobs:
  db:
    command: docker compose up db
  web:
    command: pnpm dev --port $PORT
    needs: [db]

urls:
  app:
    url: http://localhost:{web}/
```
