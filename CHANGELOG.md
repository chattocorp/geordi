# Geordi Changelog

## 0.5.0

### Fixes

- Pictures an agent shows in its replies are no longer the old ones when it writes a file of the same name again. ([#178](https://github.com/chattocorp/geordi/pull/178))
- Sync now comes before Disable Auto-merge in a workspace's actions. ([#172](https://github.com/chattocorp/geordi/pull/172))
- A new workspace whose branch was renamed is no longer shown as merged before it has done any work. ([#166](https://github.com/chattocorp/geordi/pull/166))
- Pull requests that branch protection or rulesets still block (required checks missing, or the branch out of date) no longer show as ready to merge: Geordi says "Merge blocked", or offers to sync the branch first. ([#173](https://github.com/chattocorp/geordi/pull/173))
- Dragging a workspace to the end of its repository now shows a drop line only in that repository. ([#165](https://github.com/chattocorp/geordi/pull/165))
- Rows in the sidebar and tabs turn bold a little faster. ([#183](https://github.com/chattocorp/geordi/pull/183))
- A pull request that is ready to merge now offers Merge PR instead of Auto-merge. ([#169](https://github.com/chattocorp/geordi/pull/169))
- The number of incoming commits on the Sync button now takes the colour of the button it is on. ([#171](https://github.com/chattocorp/geordi/pull/171))
- Very long file names in the Changes tab are now cut short instead of running into the line counts; the directory gives way first. ([#179](https://github.com/chattocorp/geordi/pull/179))
- Workspaces in the sidebar now ease between regular and bold, rather than jumping. ([#175](https://github.com/chattocorp/geordi/pull/175))
- The background tasks list above the reply box now starts collapsed. ([#174](https://github.com/chattocorp/geordi/pull/174))

### Features

- The reply box grows with what you write, up to a limit, and scrolls beyond it. ([#170](https://github.com/chattocorp/geordi/pull/170))
- Geordi on macOS can download updates and restart when you choose. Open Settings → About to check for updates, try beta releases, or install a downloaded update. ([#167](https://github.com/chattocorp/geordi/pull/167))
- Run Geordi without the desktop app: `npx geordi` starts it in a terminal, on http://localhost:7717. ([#181](https://github.com/chattocorp/geordi/pull/181))
- The Changes tab now shows how many lines were added and removed, in place of the file count. ([#176](https://github.com/chattocorp/geordi/pull/176))
- Settings are now a page of their own, beside the sidebar, instead of a dialog. Each section has its own address. ([#182](https://github.com/chattocorp/geordi/pull/182))
- MCP clients outside Geordi, such as Claude Code or Codex in your terminal, can connect to Geordi with a token from Settings → Agent access. They can find and read any workspace, start agents in any of your repositories and supervise them, and send follow-ups to other agents. Geordi agents can now read workspaces across all repositories too. ([#140](https://github.com/chattocorp/geordi/pull/140))

## 0.4.0

### Fixes

- Agents now know they can draw Mermaid diagrams and SVG in their replies, and show SVG files they made. ([#154](https://github.com/chattocorp/geordi/pull/154))
- Sidebar and pane dividers keep their appearance when you hover over them. ([#158](https://github.com/chattocorp/geordi/pull/158))
- The selected tab in dark mode is quieter. ([#152](https://github.com/chattocorp/geordi/pull/152))
- The desktop app is a third of its former size (the DMG a quarter): it now uses the Claude Code and Codex you have installed instead of shipping its own copies. ([#159](https://github.com/chattocorp/geordi/pull/159))
- The Archive button now shows “Archiving…” while the workspace is being archived. ([#155](https://github.com/chattocorp/geordi/pull/155))
- The Archive button keeps its label while the busy indicator runs. ([#160](https://github.com/chattocorp/geordi/pull/160))
- Retry, and every other next step on a red ribbon, now takes the ribbon’s red. ([#149](https://github.com/chattocorp/geordi/pull/149))
- A workspace whose branch was only brought up to date with its base no longer shows as merged. ([#164](https://github.com/chattocorp/geordi/pull/164))
- Removed the redundant Working label and spinner from workspace and overview ribbons. ([#157](https://github.com/chattocorp/geordi/pull/157))
- Overview cards keep their status ribbon inside the card when an agent is at work and has a next step. ([#149](https://github.com/chattocorp/geordi/pull/149))
- A workspace now says "Checking…" while it waits to learn how its work stands, instead of showing an empty bar. ([#162](https://github.com/chattocorp/geordi/pull/162))

### Features

- Drag workspaces in the sidebar to put them in the order you like. New workspaces still appear at the top. ([#163](https://github.com/chattocorp/geordi/pull/163))
- Sections on the Overview page can be folded away by their heading, and stay folded. ([#149](https://github.com/chattocorp/geordi/pull/149))
- Mermaid diagrams and SVG in an agent’s replies are now shown as pictures instead of code, and agents can show SVG files they made, like screenshots. ([#150](https://github.com/chattocorp/geordi/pull/150))
- The Sync button shows how many commits from the base branch are ready to merge into the workspace. ([#161](https://github.com/chattocorp/geordi/pull/161))
- The reply box now shows running background commands and subagents in a collapsible tray. Select a task to open its tool call or conversation. ([#156](https://github.com/chattocorp/geordi/pull/156))

### Performance

- Agent output and terminals stay responsive while Geordi waits for Git on large or slow repositories.

  Continue keeps your current branch and files if switching branches would overwrite a new, untracked file that Git does not ignore. ([#151](https://github.com/chattocorp/geordi/pull/151))

## 0.3.0

### Fixes

- Archiving a workspace with a finished background terminal job no longer asks for confirmation while the shell waits to reap the process. ([#126](https://github.com/chattocorp/geordi/pull/126))
- Questions from agents are easier to answer: Codex's extra note field is gone (say it in your own words instead), recommended options carry a badge, and multiple-choice questions show checkboxes. ([#122](https://github.com/chattocorp/geordi/pull/122))
- The workspace ribbon keeps its previous status and actions visible while Geordi checks for updates. ([#114](https://github.com/chattocorp/geordi/pull/114))
- Archive a clean, idle workspace in one click. Geordi shows the archive dialog only for running agents, running terminal processes, or unfinished Git work. ([#115](https://github.com/chattocorp/geordi/pull/115))
- The button beside “Auto-merge enabled” now reads “Disable”. ([#111](https://github.com/chattocorp/geordi/pull/111))
- Geordi shows when it is reconnecting to the forge and keeps the last workspace view readable. ([#143](https://github.com/chattocorp/geordi/pull/143))
- Answered questions no longer show optional notes that were left empty. ([#118](https://github.com/chattocorp/geordi/pull/118))
- Keep the workspace you switched to when an archive finishes. ([#138](https://github.com/chattocorp/geordi/pull/138))
- The workspace ribbon shows running checks while auto-merge is enabled and labels the button “Disable Auto-merge”. ([#136](https://github.com/chattocorp/geordi/pull/136))
- Light mode is easier to read: secondary text, status colours and repository names in the sidebar now have stronger contrast. ([#137](https://github.com/chattocorp/geordi/pull/137))
- Clean workspaces now archive without confirmation when their terminals are idle at a shell prompt. ([#131](https://github.com/chattocorp/geordi/pull/131))
- Draggable dividers show a softer gray line on hover. ([#116](https://github.com/chattocorp/geordi/pull/116))
- The sidebar shows commits, pushes and branch switches in every workspace within moments, and checks open pull requests more often. Merged and closed pull requests are checked rarely. When GitHub limits requests, Geordi pauses its checks until GitHub allows them again, keeps showing what it last knew, and notes the pause in its log. ([#134](https://github.com/chattocorp/geordi/pull/134))
- You can archive another workspace from the sidebar while an earlier archive is still running. ([#128](https://github.com/chattocorp/geordi/pull/128))
- The macOS release ZIP contains a Developer ID-signed and notarized Geordi app. ([#124](https://github.com/chattocorp/geordi/pull/124))
- The workspace ribbon shows only Create PR when a pushed branch is ready for a pull request. ([#123](https://github.com/chattocorp/geordi/pull/123))
- The workspace checks for a new pull request as soon as an agent finishes a turn, even while an earlier refresh is running. A temporary lookup failure keeps the last known pull request visible for the same branch. ([#148](https://github.com/chattocorp/geordi/pull/148))
- The workspace ribbon shows “Uncommitted changes” when local edits are waiting for a commit. It also shows when the branch has been pushed or is behind its base. ([#132](https://github.com/chattocorp/geordi/pull/132))
- Changes shows the comparison branch and lists the files your workspace would contribute to its merge target. ([#129](https://github.com/chattocorp/geordi/pull/129))
- Updating or continuing a workspace no longer changes its files while another agent is starting or working in the same directory. ([#127](https://github.com/chattocorp/geordi/pull/127))
- The Fix errors button now matches the red Checks failing status in the workspace ribbon. ([#142](https://github.com/chattocorp/geordi/pull/142))
- Background workspace checks no longer show a spinner in the ribbon. ([#130](https://github.com/chattocorp/geordi/pull/130))
- Stop now works while an agent is still starting. ([#144](https://github.com/chattocorp/geordi/pull/144))
- Cancel and confirm buttons now have matching shapes and flat fills in the Archive and Run dialogs. ([#113](https://github.com/chattocorp/geordi/pull/113))
- Keep the last terminal row and cursor fully visible when the pane opens or changes size. ([#121](https://github.com/chattocorp/geordi/pull/121))
- Folded repositories in the sidebar show their workspace count in a quieter colour. ([#147](https://github.com/chattocorp/geordi/pull/147))

### Features

- Settings has more room and a new About section that shows your Geordi version. ([#110](https://github.com/chattocorp/geordi/pull/110))
- An Overview page shows every workspace as a card, by what it needs: those waiting for you, those at work, those still open, and those done. Each card has a small version of the workspace's ribbon: its pull request, how its work stands, and the next step, which you can take from there. The sidebar counts the workspaces that need you. ([#119](https://github.com/chattocorp/geordi/pull/119))
- Install Geordi on macOS by opening the disk image and dragging the app to Applications. ([#135](https://github.com/chattocorp/geordi/pull/135))
- Follow native subagents in the conversation. Expand a reviewer to see its tools and report, or open its activity in a tab. Select **Assigned by** to return to the agent that delegated the work. ([#125](https://github.com/chattocorp/geordi/pull/125))

### Performance

- Agent activity appears promptly in the conversation when many events arrive at once. ([#144](https://github.com/chattocorp/geordi/pull/144))
- Geordi stays fast with long conversations and a long workspace history. New image attachments share disk space when their contents are identical. ([#120](https://github.com/chattocorp/geordi/pull/120))

## 0.2.0

### Fixes

- Pull request checks show the status summary on hover, leaving more room for check details. ([#109](https://github.com/chattocorp/geordi/pull/109))
- The new workspace composer is wider, and the permission label matches the other selected values. Paste or drop images into the composer to attach them. ([#103](https://github.com/chattocorp/geordi/pull/103))
- Widen the navigation sidebar to read longer workspace titles. The right sidebar now leaves at least half the workspace for the conversation. ([#107](https://github.com/chattocorp/geordi/pull/107))
- GitHub releases now show the features and fixes from the changelog for that version. ([#106](https://github.com/chattocorp/geordi/pull/106))

### Features

- Inspect pull request checks in the PR tab. See failures and active jobs first, expand the other results, and open individual runs. ([#102](https://github.com/chattocorp/geordi/pull/102))
- Enable or disable GitHub auto-merge from the workspace ribbon or sidebar while a pull request waits for required checks or reviews. ([#105](https://github.com/chattocorp/geordi/pull/105))

### Performance

- Opening a workspace reuses its recent GitHub status while local changes load. ([#108](https://github.com/chattocorp/geordi/pull/108))

## 0.1.0

### Fixes

- Composer borders fade smoothly when you focus the input, drag in an image, or the agent starts or finishes work. ([#71](https://github.com/chattocorp/geordi/pull/71))
- The sidebar no longer leaves a workspace's archive button showing after you pick something from its context menu. ([#27](https://github.com/chattocorp/geordi/pull/27))
- The workspace button for bringing in commits from the base branch is now called Sync. ([#96](https://github.com/chattocorp/geordi/pull/96))
- Clicks no longer stop working in a workspace with several terminals or conversations open. Everything live on a page now arrives over a single connection per window, so the browser's limit on connections can't be reached. ([d25a56d](https://github.com/chattocorp/geordi/commit/d25a56dd452da843442f8d1719a823812a086dfa))
- Tabs have less padding on their left side. ([#22](https://github.com/chattocorp/geordi/pull/22))
- Agents are now prompted to link to other Geordi workspaces by title in their replies. ([#60](https://github.com/chattocorp/geordi/pull/60))
- Switching workspaces now scrolls the conversation to the newest messages. ([#5](https://github.com/chattocorp/geordi/pull/5))
- Workspaces in the sidebar no longer move to the top when they notify you; an agent's workspaces are indented a little under the one that started them. ([#42](https://github.com/chattocorp/geordi/pull/42))
- Image attachments now keep their aspect ratios in a compact row above your message. Open a thumbnail to inspect it at full size, or remove it with the small corner button. ([#20](https://github.com/chattocorp/geordi/pull/20))
- When a workspace offers several next steps, they now sit together in one pill instead of as separate buttons. ([#26](https://github.com/chattocorp/geordi/pull/26))
- Repositories in the sidebar are evenly spaced, whether open or folded, and their names are easier to read. ([#47](https://github.com/chattocorp/geordi/pull/47))
- The desktop app no longer asks for access to the microphone when it plays a notification sound, and its notifications now appear. ([d25a56d](https://github.com/chattocorp/geordi/commit/d25a56dd452da843442f8d1719a823812a086dfa))
- The Run menu shows each link by its label or name and omits the URL. ([#64](https://github.com/chattocorp/geordi/pull/64))
- The dotted circle beside Checks running now rotates while checks are in progress. ([#6](https://github.com/chattocorp/geordi/pull/6))
- Repository names in the sidebar are quieter, and repositories without workspaces are spaced a little further apart. ([#21](https://github.com/chattocorp/geordi/pull/21))
- Inline code in agent replies uses a brighter plum in light mode. Only links and clickable file references have underlines. ([#63](https://github.com/chattocorp/geordi/pull/63))
- Remove the shimmer below conversation tabs and make the working prompt border clearer. ([#16](https://github.com/chattocorp/geordi/pull/16))
- Conversation messages keep the line breaks you and your agent type. ([#90](https://github.com/chattocorp/geordi/pull/90))
- Running workspaces now show a muted gray spinner in the sidebar. ([#62](https://github.com/chattocorp/geordi/pull/62))
- The sidebar archive icon stays purple when you hover over a merged workspace. ([#57](https://github.com/chattocorp/geordi/pull/57))
- Ready for review marks a draft GitHub pull request ready directly from the ribbon or sidebar, without starting an agent turn. ([#88](https://github.com/chattocorp/geordi/pull/88))
- Archive now appears purple in the workspace context menu. ([#76](https://github.com/chattocorp/geordi/pull/76))
- A workspace with nothing to report but a next step shows just that step, without an empty frame around it. ([#28](https://github.com/chattocorp/geordi/pull/28))
- A pull request that an agent opened just before finishing its turn shows up right away, without waiting for the next periodic check. ([d25a56d](https://github.com/chattocorp/geordi/commit/d25a56dd452da843442f8d1719a823812a086dfa))
- Use the browser’s default font smoothing for clearer, fuller text. ([#14](https://github.com/chattocorp/geordi/pull/14))
- Click the PR number in the workspace ribbon to show its tab. The external-link icon opens the PR in your browser. ([#101](https://github.com/chattocorp/geordi/pull/101))
- After a pull request is merged, Geordi fetches from upstream, so other workspaces of the repository see the new commit right away. ([f93c6a8](https://github.com/chattocorp/geordi/commit/f93c6a851fda43810c8292b289b254f3f0df2a3b))
- Settings and other dialogs now zoom gently into view when opened. ([#92](https://github.com/chattocorp/geordi/pull/92))
- Workspace tabs have slightly stronger contrast for inactive labels and the selected tab background. ([#89](https://github.com/chattocorp/geordi/pull/89))
- Child workspaces have a shorter header. The sidebar shows which workspace started each child. ([#53](https://github.com/chattocorp/geordi/pull/53))
- Terminals opened with the + button now receive keyboard focus automatically. ([#8](https://github.com/chattocorp/geordi/pull/8))
- Highlighted rows follow the rounded corners of the Run menu and other context menus. ([#64](https://github.com/chattocorp/geordi/pull/64))
- The focused composer now has a subtle gray outline. ([#54](https://github.com/chattocorp/geordi/pull/54))
- Background command results appear on the original tool call when the command finishes after its turn. ([#79](https://github.com/chattocorp/geordi/pull/79))
- The Resolve conflicts button now matches the red conflict indicator in both themes. ([#94](https://github.com/chattocorp/geordi/pull/94))
- Geordi saves question answers across reconnects and shows when delivery is unconfirmed. Codex can ask a question while it keeps working. ([#73](https://github.com/chattocorp/geordi/pull/73))
- When you switch models in a conversation, Geordi clears an effort level the new model does not support. ([#86](https://github.com/chattocorp/geordi/pull/86))
- URLs in terminal output are now clickable and open in your browser. ([#10](https://github.com/chattocorp/geordi/pull/10))
- Archiving a workspace now always asks for confirmation, including when pull request checks are still running. ([#98](https://github.com/chattocorp/geordi/pull/98))
- Earlier agent messages in each turn are slightly dimmed so the final reply is easier to find. ([#14](https://github.com/chattocorp/geordi/pull/14))
- The New workspace page centers the composer and gives you two more lines to write your prompt. ([#68](https://github.com/chattocorp/geordi/pull/68))
- Agents checking repository configuration can now see which job or URL Run selects and why. ([#93](https://github.com/chattocorp/geordi/pull/93))
- Archiving a workspace that an agent started takes you back to the workspace of the agent that started it. ([#44](https://github.com/chattocorp/geordi/pull/44))
- The sidebar, pull request tab and merge ribbon now show CI updates together. Geordi checks more often after a push and while checks run. After a restart, Geordi staggers branch searches so active CI can still update. ([#99](https://github.com/chattocorp/geordi/pull/99))
- The repository picker shows each repository’s icon beside its name. ([#61](https://github.com/chattocorp/geordi/pull/61))
- A calmer screen: gold is now only for sending a message and for agents at work (in the sidebar and around the reply box), repositories in the sidebar are small labels above their workspaces, changed files keep their names when paths are cut short, and "Jump to latest" sits beside the conversation instead of on top of it. ([f93c6a8](https://github.com/chattocorp/geordi/commit/f93c6a851fda43810c8292b289b254f3f0df2a3b))
- Background command output stays with the original tool call when a later turn is running. ([#81](https://github.com/chattocorp/geordi/pull/81))
- Hide the sidebar icon for workspaces without a pull request. ([#58](https://github.com/chattocorp/geordi/pull/58))
- Keep Merge PR busy after a successful merge until the ribbon shows Archive. ([#83](https://github.com/chattocorp/geordi/pull/83))
- Choosing a repository, model or effort in the composer, or adding an image to a message, puts the cursor back in the text. You can keep writing while images upload. ([#24](https://github.com/chattocorp/geordi/pull/24))
- Notifications now lead with what happened ("Agent finished") and name the workspace below. ([#17](https://github.com/chattocorp/geordi/pull/17))
- The Conversation tab shows a Braille spinner while its agent is working. ([#82](https://github.com/chattocorp/geordi/pull/82))
- The “Checks running” icon now rotates more slowly. ([#95](https://github.com/chattocorp/geordi/pull/95))
- The setup terminal now closes automatically when setup succeeds. If setup fails, it stays open so you can read the output. ([#51](https://github.com/chattocorp/geordi/pull/51))
- Inline code in agent replies uses plum or rose text with a hot-pink underline and long paths wrap on narrow screens. ([#59](https://github.com/chattocorp/geordi/pull/59))
- Bullet points sit closer together in conversation messages. ([#84](https://github.com/chattocorp/geordi/pull/84))
- Tidier workspace screen: the workspace ID is gone from the header (copy it from the workspace's menu in the sidebar), and the changes list shows its totals under the files instead of repeating the file count above them. ([e9977b8](https://github.com/chattocorp/geordi/commit/e9977b8fa40eb57e0a3aa732b1792f72cb49a1c6))
- While an agent works, the reply box has a plain Stop button and labelled Queue and Steer buttons, and the Conversation tab no longer repeats that the agent is working. ([f93c6a8](https://github.com/chattocorp/geordi/commit/f93c6a851fda43810c8292b289b254f3f0df2a3b))
- A reply that begins with tools now lines them up with the agent's icon. ([#33](https://github.com/chattocorp/geordi/pull/33))
- The sidebar now shows only repositories with current workspaces. ([#55](https://github.com/chattocorp/geordi/pull/55))

### Features

- ⚠️ **BREAKING CHANGE:** Send a message to a working Codex or Claude session, or queue it for the next turn. Geordi can show replies when background work wakes the agent. Sessions survive app and daemon restarts. Finish active turns before the first update from the old runner. ([#66](https://github.com/chattocorp/geordi/pull/66))
- Download unsigned desktop builds for Apple silicon Macs and x64 Windows PCs from GitHub Releases. ([#80](https://github.com/chattocorp/geordi/pull/80))
- A repository's configuration is now YAML, in `.geordi.yml`. A `.geordi.toml` is still read where there is no `.geordi.yml`; where a repository has both, the YAML file counts. ([2db0de3](https://github.com/chattocorp/geordi/commit/2db0de3a855e4c004e4cd2e396303bf8ec1b5030))
- Set a default job or URL for the Run button in .geordi.yml. Use the chevron to see all run options. ([#78](https://github.com/chattocorp/geordi/pull/78))
- Your sent and queued messages now support Markdown, and pasted URLs become clickable links. ([#67](https://github.com/chattocorp/geordi/pull/67))
- The Run and Open menus are now one Run menu: the links to open come first, then what you can start and stop. While something you started is still booting, its terminal tab and the Run button show a spinner. ([#48](https://github.com/chattocorp/geordi/pull/48))
- Workspaces with a pull request now show a numbered tab beside Changes. It shows check progress while checks run. Open the tab to read the title and description and see the state, review, target branch and checks. Long links in the description wrap to fit narrow panes. ([#87](https://github.com/chattocorp/geordi/pull/87))
- A repository's name in the sidebar now folds its workspaces away, and shows how many there are while folded. The repository's own page is gone. ([#43](https://github.com/chattocorp/geordi/pull/43))
- Use the radar for Auto Mode or the key for Full Access for each workspace. Agents handle tool permissions without interrupting you. ([#86](https://github.com/chattocorp/geordi/pull/86))
- Settings have a Notifications section, with a button to send a test notification. In the desktop app, notifications come with Geordi's own sounds and the Dock icon counts unread workspaces. ([d25a56d](https://github.com/chattocorp/geordi/commit/d25a56dd452da843442f8d1719a823812a086dfa))
- New keyboard shortcuts for starting work: Cmd+Shift+N (Ctrl+Shift+N) opens a new workspace with the repository picker open, from anywhere in Geordi. Cmd+Shift+M and Cmd+Shift+E (Ctrl+Shift+M and Ctrl+Shift+E) choose the model and the effort in the message box you are typing in. Cmd+N (Ctrl+N) still opens a new workspace, but no longer opens the repository picker. ([#41](https://github.com/chattocorp/geordi/pull/41))
- Workspaces now rise to the top of their repository group when they notify you, and keep their position after you read them. ([#13](https://github.com/chattocorp/geordi/pull/13))
- Update now brings in the latest of the base branch at once, without an agent turn, when the workspace has no uncommitted changes and nothing conflicts. The agent is still asked where there are conflicts or uncommitted work. ([b735753](https://github.com/chattocorp/geordi/commit/b73575337a62ee0c1ff864ce63740044d9451789))
- Open relative file links in workspace messages in the file’s diff pane. File links keep their Markdown titles as hover text. ([#77](https://github.com/chattocorp/geordi/pull/77))
- Agents can ask for a decision in the workspace question form during ordinary Claude and Codex turns. ([#69](https://github.com/chattocorp/geordi/pull/69))
- Follow an agent’s plan in the conversation as it checks off steps. Completed plans fold away and can be opened again. ([#75](https://github.com/chattocorp/geordi/pull/75))
- Build and run an isolated Electron dev app from the Run menu, with separate workspace data, browser profile, logs, and assigned ports. The installed app and browser dev server can keep running. ([#4](https://github.com/chattocorp/geordi/pull/4))
- Agents now give their branches names that say what the work is about, instead of leaving them as `geordi/` and an ID. ([#30](https://github.com/chattocorp/geordi/pull/30))
- What you write in a composer, for a new workspace or a reply, and the images you attach are still there when you leave and come back, until you send them. ([#23](https://github.com/chattocorp/geordi/pull/23))
- Open source links in agent replies to read the workspace file at the cited line, including files with no changes. ([#52](https://github.com/chattocorp/geordi/pull/52))
- The workspace ribbon now offers Update when the base branch has new commits to bring into your work. ([#9](https://github.com/chattocorp/geordi/pull/9))
- A calmer look: the sidebar, the conversation, the changes and the terminals are now rounded panels with a little room between them, in place of the lines that used to divide the screen. The conversation is the lightest of them, so it stands out as the thing to read. ([#46](https://github.com/chattocorp/geordi/pull/46))
- Mark a draft pull request ready for review from the workspace ribbon. ([#74](https://github.com/chattocorp/geordi/pull/74))
- The sidebar shows how each workspace stands, at the end of its row: ready to merge, merged, checks failing, changes requested, a draft, or a ring that fills as checks run. Workspaces you don't have open are kept up to date in the background. ([d25a56d](https://github.com/chattocorp/geordi/commit/d25a56dd452da843442f8d1719a823812a086dfa))
- Use Cmd-N (Ctrl-N on Windows and Linux) to open New Workspace, then press it again to open the repository picker. ([#2](https://github.com/chattocorp/geordi/pull/2))
- A file the workspace has changed, named in code in an agent's reply, is now a link that opens its diff. ([#29](https://github.com/chattocorp/geordi/pull/29))
- Agents can now see how their workspace stands (its changes, pull request, checks) and what the next steps are, and the same for the agents they started. ([#31](https://github.com/chattocorp/geordi/pull/31))
- Copy the text of a user or agent message with the clipboard icon beneath it. Copied replies preserve their Markdown formatting. ([#50](https://github.com/chattocorp/geordi/pull/50))
- Install the Electron app from the Run menu. The installer survives the app restart, prepares the replacement before quitting, and leaves the installed app intact if it cannot quit. Package-only builds leave the running app alone. ([#4](https://github.com/chattocorp/geordi/pull/4))
- Pictures in agent replies open in a viewer over the page, with the usual right-click menu (copy, save). The desktop app now has a right-click menu for pictures, selected text and text fields. ([#35](https://github.com/chattocorp/geordi/pull/35))
- Tabs fade in when they open and fade out when they close. ([#49](https://github.com/chattocorp/geordi/pull/49))
- A repository can name `setup` and `teardown` scripts in its configuration. Setup runs in a new workspace before its agent starts (to install dependencies, say), and teardown runs when you archive a workspace, before its worktree is removed. Both run only once you have approved them. A workspace says when its repository's setup script is waiting for that, with a button to review it.

  `setup` and `teardown` can no longer be used as job names. ([#1](https://github.com/chattocorp/geordi/pull/1))
- Right-clicking a workspace in the sidebar now offers its next steps, such as creating, updating or merging its pull request, coloured and with icons as in its ribbon. ([#18](https://github.com/chattocorp/geordi/pull/18))
- The top of a workspace says more about where its work stands. The pull request has a pill of its own. Work that was merged into the branch it started from shows as merged and can be archived, a pushed branch without a pull request offers to open one, and a failed turn offers to retry. While an agent is working, committing and opening or updating a pull request are not offered. ([d25a56d](https://github.com/chattocorp/geordi/commit/d25a56dd452da843442f8d1719a823812a086dfa))
- Completed turns keep the final reply visible and group earlier messages and tool calls under Turn activity. ([#56](https://github.com/chattocorp/geordi/pull/56))
- Run an isolated development copy of Geordi and Storybook from workspace links, with separate ports and local test data. ([#3](https://github.com/chattocorp/geordi/pull/3))
- Give Run jobs and Open links readable names with the optional label setting, while keeping their keys and assigned ports unchanged. The Geordi repository uses these labels for its Web server, Agent daemon, and Storybook jobs, with Geordi and Storybook links. ([#3](https://github.com/chattocorp/geordi/pull/3))
- The app opens on the workspace (or page) it showed when it was last closed. A link to a workspace that no longer exists leads to a new one. ([#15](https://github.com/chattocorp/geordi/pull/15))
- A workspace no longer lists the agents it started above its conversation: the sidebar already shows them, under it. ([#45](https://github.com/chattocorp/geordi/pull/45))
- Agents can message the agents they started while those are working: the message waits for the current turn to end, or interrupts it if asked to. In a conversation, messages from another agent are marked with the workspace they came from. ([d25a56d](https://github.com/chattocorp/geordi/commit/d25a56dd452da843442f8d1719a823812a086dfa))
- Drop images onto a message box to attach them, as you can paste them. ([#32](https://github.com/chattocorp/geordi/pull/32))
- Paste images or add image files to messages for Claude and Codex, with previews, queued attachments, and images kept in the conversation. ([#20](https://github.com/chattocorp/geordi/pull/20))
- A pull request that conflicts with its base branch now says so in the workspace and the sidebar, with a button to have the agent resolve the conflicts. ([#11](https://github.com/chattocorp/geordi/pull/11))
- You hear about workspaces that need you: when an agent finishes or fails in a workspace you are not looking at, Geordi shows a notification and plays a quiet sound. Such workspaces stay bold in the sidebar until you open them, and the desktop app counts them on its Dock icon. Notifications can be turned off in Settings. ([#1](https://github.com/chattocorp/geordi/pull/1))
- A job that has ended no longer counts as running: its tab shows how it ended, and it can be started again. While an agent is working, the reply box shows a Stop button that turns from a spinner into a stop square when pointed at. ([d25a56d](https://github.com/chattocorp/geordi/commit/d25a56dd452da843442f8d1719a823812a086dfa))
- Agents can show pictures in their replies: a screenshot or chart they refer to as a Markdown image, by the path of its file, appears right in the conversation. ([#25](https://github.com/chattocorp/geordi/pull/25))
- Agents can now choose the model and effort of the agents they start, from what each agent has on offer. ([#19](https://github.com/chattocorp/geordi/pull/19))

### Performance

- Long conversations now render only visible messages, keeping the message view responsive as history grows. ([#12](https://github.com/chattocorp/geordi/pull/12))
- Workspaces show changed files and open their first terminal while pull request status and release notes are still loading. Bursts of edits share a refresh. ([#70](https://github.com/chattocorp/geordi/pull/70))
- The sidebar updates running pull request checks sooner and refreshes known pull requests together. ([#91](https://github.com/chattocorp/geordi/pull/91))
