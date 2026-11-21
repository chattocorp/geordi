---
data:
  priority: normal
  status: done
  type: bug
id: 4e9je
title: Notify the parent before starting queued work
---
In a focused domain test, a parent delegated work and a person queued a follow-up message for the child. After both turns the parent had received no report. Capture the delegated result before promoting the next message. Cover automatic notification and waiting parents (FDR-002).

Waiting callers receive a snapshot of the completed turn. The parent receives its notification before the next queued message starts. Both delivery paths have regression coverage.