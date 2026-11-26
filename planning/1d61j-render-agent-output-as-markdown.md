---
data:
  priority: low
  status: done
  tags:
    - agents
    - ui
  type: feature
id: 1d61j
title: Render agent output as Markdown
---
Agent messages are shown as plain pre-wrapped text. Render Markdown (sanitised), and show tool calls more compactly.

## Outcome

Agent messages render as Markdown via markdown-it (raw HTML disabled, unsafe link protocols rejected), styled with the typography plugin in both themes. Tool calls are single expandable lines with an icon per tool and paths relative to the worktree.

Source citations follow-up (2026-11-18). Absolute Markdown links to worktree files open in a source tab. Verified the cited line, an unchanged file with spaces in its name, and the missing-file message in Chromium against an isolated forge and daemon.

Inline code follow-up. Code spans use plum text in light mode and rose text in dark mode, with a hot-pink underline, and wrap long paths. Checked the transcript story in light and dark themes and at a 230px viewport width.

Plain inline code uses a brighter plum in light mode and rose in dark mode, without an underline. Verified snippets and underlined links together in both Storybook themes.

Sent and queued user messages now use the same Markdown renderer as agent replies. The conversation story checks automatic links, explicit Markdown links, and copying the original text.

Bullet lists now have a 2px gap between items, including when the Markdown has blank lines between bullets. Verified the gap in the message view story in Chromium.

Conversation messages preserve single line breaks in sent and queued messages and agent replies. Verified the account choices on separate lines in Chromium.

Long Markdown links now wrap inside narrow messages. The commit link story checks that each line fits inside the bubble and the full URL remains the link target.
