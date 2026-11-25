---
data:
  priority: normal
  status: done
  type: bug
id: f1k4x
title: Scroll to the bottom when sending a conversation message
---
Sending a reply while reading history should bring the newest content into view, even if an earlier scroll event is pending.

The conversation now jumps immediately on send and follows later layout changes. A Chromium regression test reproduced the missed jump with 500 messages and now verifies the posted message and final scroll position.