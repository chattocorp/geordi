---
title: Geordi planning
description: 'The Geordi backlog: features, bugs, tasks, and design decisions for Geordi itself.'
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    type:
      type: string
      enum: [task, bug, feature, decision]
      description: Task for general work, bug for incorrect behavior, feature for new functionality, decision for a recorded design decision.
    status:
      type: string
      enum: [todo, in_progress, done, canceled]
      description: Todo before work starts, in_progress while working, done once acceptance criteria are met (or a decision is accepted), canceled when intentionally abandoned.
    priority:
      type: string
      enum: [low, normal, high, urgent]
      description: Relative importance, ordered urgent, high, normal, then low.
    tags:
      type: array
      items:
        type: string
        minLength: 1
      uniqueItems: true
      description: Optional labels for grouping related items.
  required: [type, status, priority]
  additionalProperties: false
app:
  views:
    - title: Open work
      filter: data.status in ["todo", "in_progress"]
      columns: [title, data.type, data.status, data.priority]
    - title: Decisions
      filter: data.type == "decision"
      columns: [title, data.status]
---

# Working with Geordi planning

This collection is Geordi's backlog. Run commands from the repository root:

```sh
means list --path ./planning --limit 0 --json
means search --path ./planning --filter status=todo --json
means read <id> --path ./planning --json
means create --path ./planning --input - --json
means update <id> --path ./planning --input - --json
```

Create with:

```json
{
	"frontmatter": {
		"title": "Add a feature",
		"data": { "type": "feature", "status": "todo", "priority": "normal" }
	},
	"body": "Context and acceptance criteria..."
}
```

Never supply `id`; means generates it. Reference other items by ID.

## Workflow

1. List existing items and read relevant ones before creating new ones. Avoid duplicates.
2. Follow the user's scope and priorities. The tag `deferred` marks ideas that stay
   out of scope until the user picks them up.
3. Set `in_progress` when starting agreed work. Set `done` only when acceptance
   criteria are met, and record the outcome in the body. Use `canceled` for
   abandoned work instead of deleting.
4. Decisions: describe context, alternatives, and rationale in the body. Keep them
   `todo` while open, `done` once accepted.
5. Read before each update and supply the returned `hash`. On conflict, read again
   and reconcile. Omitting `body` preserves it; supplying it replaces it entirely.
6. Mention relevant item IDs in commits and when reporting work.
