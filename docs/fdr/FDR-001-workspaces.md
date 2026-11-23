# FDR-001: Workspaces

**Status:** Active
**Last reviewed:** 2026-11-20

## Overview

A workspace is a piece of work: one conversation with one agent, in a Git worktree on its own branch, together with the changes made there, their pull request, and terminals. People use it to hand a task to an agent, watch what it changes, steer it, and step in by hand.

## Behavior

- A workspace is started with an agent and a repository, and usually with a first prompt (without one, it is there with its worktree, waiting to be told what to do): from "New workspace" at the bottom of the sidebar, above Archive and Settings, where the repository worked in last is preselected, or from the + beside a repository's name. It gets its own worktree and branch, which starts from the main branch of the repository's upstream as it stands at that moment (Geordi fetches first), not from whatever the repository has checked out. A repository without an upstream, or one that can't be reached, starts from what is there. It is named after the first line of that prompt at first. Its agent then gives it a short name that says what the work is about, once it knows (the agent API's `name_workspace`), and may change it a couple of times if the work turns out to be about something else. Until then, the title its agent gives the conversation (Claude makes one from the prompt within seconds; Codex once its first turn ends) bridges the moments, and replaces the first line; a name the agent or whoever started the workspace chose is never replaced by it.
- Choose **Rename workspace** in the sidebar context menu to set the name yourself. Once you save it, only you can rename the workspace again.
- A workspace has exactly one conversation. To work on something else, or to have a second agent, start another workspace (or let the agent start one: FDR-002).
- Geordi saves each prompt before sending it. While a saved prompt waits for an offline daemon, the conversation shows **Waiting for daemon**. Delivery resumes when it reconnects.
- During a turn, the conversation shows progress as it happens. When the turn ends, the final reply or failure stays visible. Open **Turn activity** to inspect earlier messages and tool calls in order.
- At the end of a turn that changed files, the reply footer shows the filename for a single edit or the number of changed files, plus the lines added and removed. Select it to open the numbered turn tab. Each text diff opens expanded and can be folded from its file header. The diff compares the worktree at the start and end of the turn, so it includes shell edits and commits. Edits made at the same time by another agent or a person in the same worktree are included. The saved diff stays available after later edits or archiving. For large patches, the summary keeps the counts and file list.
- An agent’s plan updates in place as its steps change. If the agent continues the plan in a later exchange, the card moves into that reply. The current step stands out. When all steps are complete, the plan folds into a summary that can be reopened. Agents can also share a written plan or withdraw a plan.
- While the agent is working, Enter steers it: the message reaches the agent in the middle of its turn, which goes on, and is the next thing it reads (ADR-010). Stop stops the turn, and with it what was said and not read yet. Cmd/Ctrl+Enter queues the message instead: it waits and goes out when the agent has finished its turn. Queued messages are shown under the conversation and can be taken back. After a turn that failed or was stopped, they stay put until the person says something.
- An agent can start something in the background and come to rest; when it has finished, the agent takes up work again by itself, and the workspace shows as working.
- An agent can ask the person something: the question shows in the conversation with the answers it offers, any of which can be given, or one in the person's own words. The question link in the sidebar or workspace ribbon opens the conversation of the agent that asked and focuses the first answer option or text field. Codex can also ask a question while it continues to work. Geordi saves a submitted answer and retries after a reconnect until the host accepts it or the question closes. If the agent withdraws the request or its turn ends, the form closes. A submitted answer stays visible with a notice if delivery was unconfirmed.
- In a first prompt or reply, type `@` followed by letters from a file name or path in order. The letters can be apart. The picker shows up to 40 matches. Each row shows the file name beside its folder and highlights the matching letters. Choose a repository file with the mouse, Enter or Tab. The message includes its repository-relative path so the agent can locate the file. First prompts search the starting revision. Conversations in an existing worktree also offer new, unignored files.
- Messages can include images, with or without text. Drop image files onto the composer or paste an image from the clipboard. The composer shows previews above the text in one horizontally scrolling row. Previews keep the full image visible at its original aspect ratio and open the full image when clicked. A small remove button appears on hover or keyboard focus; touch screens always show it. Each message accepts up to four PNG, JPEG, WebP or GIF files, at most 5 MB each. Sending waits until uploads finish; an upload error leaves the draft in place.
- Images work in first prompts, replies, queued messages and steering messages, with both Claude and Codex. Sent and queued messages show thumbnails that open the full image. Images remain available after a restart and after the workspace is archived.
- An agent shows a picture (a screenshot, a chart) by writing a Markdown image with the path of its file: it appears in its reply, and opens in full when clicked. The file is read where the agent works, when the reply is shown: PNG, JPEG, WebP or GIF, at most 5 MB, from the worktree or anywhere else on that machine. A file that is gone, or is no picture, leaves its path. Images from the web are never loaded, only linked.
- An absolute Markdown link to a file in the worktree opens its current contents in a workspace tab, including files with no changes. A trailing line number such as `:139` scrolls to that line and highlights it. If the file is unavailable, the tab explains why it cannot show the text.
- The workspace's ID is shown in its header; a click copies it.
- At the top of the sidebar, the repository picker and Today toggle stay visible as the list scrolls. Cmd+Option+F on Mac or Ctrl+Alt+F elsewhere opens the picker and focuses its search field, revealing the sidebar if needed. Choose a repository to focus it, or All repositories to clear focus. The calendar button limits the list to workspaces with activity today and can be combined with repository focus. Cmd/Ctrl+Shift+T also toggles Today. The day starts at local midnight. Previous and next workspace follow the filtered list.
- Cmd/Ctrl+Shift+Enter opens the next unread workspace in visible sidebar order, wrapping to the top when needed. If no other visible workspace is unread, you stay where you are.
- Cmd/Ctrl+B hides and shows the navigation on the left, and with Alt/Option the changes and dock on the right. Both also have a button, and the navigation's edge can be dragged to resize it.
- A workspace has a fixed frame: the main area, and beside it the changes above the dock. The lines between them can be dragged to resize, and that is all that can be changed about the frame.
- The main area holds the conversation, which is always there and stays there. Diffs open next to it as further windows.
- The dock holds terminals. It starts empty.
- Windows are tabs. Within the main area and within the dock, a tab can be dragged onto another group of tabs to move it there, or towards an edge of a group to split it and place the window beside, above or below.
- Diffs and terminals can also be dragged between the two: a terminal out of the dock to sit beside the conversation, a diff into the dock. The conversation cannot leave the main area, and the changes are not a window at all.
- The top bar shows what could happen next (FDR-003).
- **Changes** names the comparison branch and lists the files the workspace would contribute to it, including committed, uncommitted and untracked work. The toolbar opens a combined diff with a collapsible section for each changed file. Selecting a file opens a single diff tab next to the conversation. Selecting another file reuses that tab wherever you placed it. The tab shows the filename, with the full path available on hover. The list updates as files change.
  - PNG, JPEG, WebP, and GIF files open as pictures. Click a picture to enlarge it. For a changed raster image, switch between **Before** and **After**. A deleted file shows its last version.
  - Selecting a Markdown or text SVG change always opens **Diff**. Choose **Preview** to read the formatted document or see the picture. Source tabs open these files in **Preview** and offer **Source**. Markdown resolves local pictures and file links from its folder. A link to a specific line opens the source at that line.
  - A diff shows the changed lines with syntax highlighting and the changed words within a line marked. The unchanged lines between changes are collapsed; they can be revealed a few at a time, upwards or downwards, or all at once, so there is always as much context as wanted without paging through the whole file.
- When the workspace branch has a pull request, a tab labeled with its number (for example, **#1234**) appears in the upper right pane. While checks run, the sidebar’s checks ring takes the place of the pull request icon on the tab. The pane shows the title, description, state, target branch, review status and checks. The checks section opens when checks are active or failed. It shows failures first, then active jobs with their status. Other checks expand on demand. Each check opens its run when the forge supplies a link. The title opens the pull request on the upstream forge.
- Cmd/Ctrl+Option/Alt+/ focuses an existing shell in its pane. If there is no shell, or a terminal already has keyboard focus, the shortcut opens and focuses a new shell in the dock.
- **Terminals** are shells in the workspace's directory. "+" in the dock opens one. None runs until asked for, there is a tab for every running shell and none for any other, and closing a terminal's tab ends its shell. Terminals keep running while the page is closed and while the forge restarts, and show their recent output when the page is opened again.
- A worktree that was removed outside Geordi (tidied away while it wasn't running, say) doesn't break its workspace: the workspace says so where it says how it stands ("Worktree removed"), with "Restore" as the next step. Restoring, or simply the next message to its agent, brings the worktree back from the workspace's branch, with everything that was committed. What wasn't committed is gone, and the workspace says that too. If the branch is gone as well, the worktree starts afresh.
- A workspace whose pull request was merged (or closed) can carry on with new work instead of being archived: **Continue** fetches, and moves its worktree to a new branch off the upstream's main branch as it stands then. The conversation stays as it is, with a line saying what happened, and its agent is told with the next message that it is on a new branch and should look at the files afresh. The branch it was on is kept. Uncommitted changes come along onto the new branch (an agent may have begun new work after the merge); if they don't fit onto it, nothing moves and the workspace says so. Not while an agent is at work in that worktree.
- A workspace can be archived when it is done with. That stops its terminal processes and Geordi tasks, closes its terminals, removes its worktree and takes it out of the lists; its branch and its conversation are kept. The archive includes children in the same repository and agents in their shared worktrees (FDR-002). Children in other repositories continue working. If an affected agent is busy, you can select **Stop and archive**. Geordi waits for the affected agents to stop before it archives any workspace. An archive requested by an agent fails if an affected agent is busy. The archive dialog appears only when an affected workspace has a running agent, uncommitted changes, unmerged commits, or an unmerged pull request. It names the workspace and explains what needs attention. Agents archiving the workspaces they started are never asked, and never lose uncommitted work: for them, archiving stops there.
- Open **Archive** in the sidebar to find a conversation by title or repository. Open it to read it, then select **Restore** to return it to active work and send another message. Workspaces in the archive can also be deleted for good (FDR-014). Restoration applies to the selected conversation and reuses its shared worktree or checks out its retained branch.
- The window arrangement and pane sizes are remembered per browser.

## Design Decisions

### 1. One conversation per workspace

**Decision:** A workspace is one agent conversation, not a container for several.
**Why:** With several, everything about a workspace needed a "which one?": which conversation an action talks to, whose turn it is, what "working" means. One conversation makes a workspace a single thread of work that people can reason about.
**Tradeoff:** Asking a second agent about the same files means another workspace. FDR-002 lets such a workspace work in the same directory.

### 2. A workspace always starts with a prompt

**Decision:** Creating a workspace takes a prompt and starts its agent right away.
**Why:** It keeps the flow from "I have a task" to "an agent is on it" to one step, and gives the workspace a name without asking for one.
**Tradeoff:** There are no empty workspaces for purely manual work.

### 3. A working agent can be steered or queued for, never refused

**Decision:** A message to a working agent either reaches it now (steering, the default) or waits its turn (queueing). Steering is said to the agent's CLI as it runs (ADR-010): the turn goes on, and takes the message in at its next step.
**Why:** People see an agent go wrong and want to correct it now, or think of the next thing and want it done after. The workspace's actions (FDR-003) queue, so they can be used at any time.
**Tradeoff:** A steering message is read at the agent's next step, not at once: a long command runs to its end first (Stop is for that). A queued message is written without knowing how the current turn ends, which is why the queue stops after a failed turn rather than pressing on.

### 4. Changes follow the merge target

**Decision:** Use the pull request target when known. Otherwise, a child compares with its parent branch if the parent has commits outside its own target. If the parent has no such commits, the child inherits that target. A top-level workspace compares with the repository’s upstream default branch.
**Why:** People want the workspace's total effect, regardless of whether an agent has committed yet.
**Tradeoff:** The comparison uses locally available Git history. In a repository without an upstream, the main checkout supplies the default target.

### 5. A fixed frame, with freedom only inside it

**Decision:** The frame (main area, changes, dock) is fixed. Tabs and splits exist inside the main area and inside the dock, and only diffs and terminals move between the two. The conversation is pinned to the main area and the changes are not movable.
**Why:** Geordi is opinionated: a workspace should look the same every time, so that people know where things are without arranging anything. The one freedom that earns its place is putting a terminal or a diff where the work is. An earlier version made everything a freely movable window; it could do more and was worse for it, because any drag could dismantle the workspace.
**Tradeoff:** No way to give the changes more room than their pane, or to move the conversation aside. No tab reordering within a group, floating windows or keyboard-driven docking either.

### 6. Layout is a browser preference, not shared state

**Decision:** Which windows are open and how they are arranged is stored in the browser, not in the forge.
**Why:** It is a personal view of the workspace, differs per screen, and changes constantly while dragging.
**Tradeoff:** The arrangement doesn't follow a person to another browser or device.

### 7. Diffs are made from whole files

**Decision:** A diff window gets both versions of the file (at the fork point and now) and works out the diff itself, instead of being handed a patch.
**Why:** A patch only carries a few lines around each change, so there would be nothing to expand into. With both versions, any amount of context is one click away.
**Tradeoff:** Two whole files travel to the browser for every diff. Pictures are limited to 5 MB per version. Other binary files and very large text files show an explanation.

### 8. Shells start only on request

**Decision:** Opening a workspace never starts a shell; only opening a terminal does.
**Why:** A shell is the user's own process in a directory agents write to (ADR-003). It should exist only when someone wants it.
**Tradeoff:** After a daemon restart the terminals are gone, tabs and all, and have to be opened again.

### 9. Archiving keeps the branch and the conversation

**Decision:** Archiving removes the worktree and hides the workspace, and nothing else.
**Why:** The worktree is the part that costs disk space and clutters; the branch may still be wanted, and the conversation is the record of what was done.
**Tradeoff:** Branches accumulate until someone deletes them.

### 10. Changes and terminals are live, not recorded

**Decision:** Neither changes nor terminal output become part of the workspace's history.
**Why:** See ADR-003.
**Tradeoff:** Both need a connected daemon, and terminal history doesn't survive a daemon restart.

### 11. Images belong to the conversation

**Decision:** Keep uploaded images with the conversation history (ADR-001), with small previews in the composer and transcript. Messages refer to each image rather than copying it.
**Why:** A screenshot is part of what the person asked, and must remain available when the forge or daemon restarts. Image data need not travel with each live conversation update.
**Tradeoff:** Uploads use disk space in the data directory. Removing a preview or taking back a queued message does not delete its uploaded bytes. Drafts that have not been sent are not restored after closing the page.

### 12. Show the forge connection beside navigation

After two seconds without a connection, the window shows “Reconnecting” above Settings, or in the title bar when the sidebar is hidden. All pages share one connection (ADR-009), so the note belongs with the window controls. While connected, the note takes no space. The delay keeps brief interruptions quiet. A page waiting for its first value explains the wait. Work already on screen stays readable.

### 13. Background tasks stay within reach after a reply

While an agent reports background work, a tray above the composer shows its commands and subagents. Expand the tray to see each task. Select Stop beside a task to end it. Its row stays visible until the agent reports that it ended. A task with a known source opens its tool call or subagent conversation. The composer stays ready for the next message. The list follows the live session and disappears when the agent clears it or the daemon disconnects.

### 14. Titles come from the agent's own session

A workspace takes the title its agent's session goes by (ACP `session_info_update`), only from the root session, and none that merely repeats the start of something it was told. A later one replaces an earlier one; a name someone chose (`name_workspace`, or a title given when it was started) is never replaced.

**Why:** Both agents title their sessions with a small model of their own, so Geordi needs no key and no model of its own for it. Each makes a title once per session and retitles it only on a rename, so a later title is news, not churn.
**Tradeoff:** Codex makes its title only when its first turn ends; until then, or until the agent names the workspace, it is called after the first line of the prompt.

## Related

- **ADRs:** ADR-001, ADR-002, ADR-003, ADR-006, ADR-009, ADR-010, ADR-012, ADR-013
- **FDRs:** FDR-002, FDR-003, FDR-014

## Open Questions

- Preview windows.
- Deleting the branch when archiving a workspace.
