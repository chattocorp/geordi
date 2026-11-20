# Your first workspace

Give an agent a small README edit, then review the change beside the conversation. A workspace gives the agent its own Git branch and working directory. You can keep using your original checkout while it works.

## Open Geordi

Start with a local Git repository that has a committed README. Sign in to Claude Code or Codex on the same machine. If you want to open a GitHub pull request at the end, use a clone you can push to and sign in with `gh auth login`.

[Download the desktop app](https://geordi.run/#install) and open Geordi. You can also follow this guide in your browser. With Node.js 24 or newer, run `npx geordi` and open the local address it prints. Keep the command running while you work.

## Add your repository

1. On **New workspace**, select **Add a repository**. Geordi opens **Settings → Repositories**.
2. Enter the path to the local checkout, such as `~/src/my-project`, and select **Add**. Your repository appears in the list.
3. Select **New workspace** in the sidebar. Check the repository name below the message box.

## Give the agent a small change

Choose a model from the agent you signed in to. Check the permission mode before sending. **Full Access** lets the agent act with your user account’s permissions. **Auto Mode** uses the agent’s automatic permission controls.

In **What should the agent do?**, enter a task you can review in one file. For a practice repository, try this:

> Add one sentence below the README heading explaining that this repository is for trying Geordi. Leave the change uncommitted for review.

Select **Get to work**. The new workspace opens with your message in the conversation. Its branch name appears at the top.

## Review the diff

When `README.md` appears under **Changes**, select it. A tab opens beside the conversation tab and shows the added line. Compare the sentence with your request. To revise it, return to the conversation and tell the agent what to change.

## Open a pull request

If your repository is connected to a supported forge, select **Create PR** at the top of the workspace. This asks the agent to commit the edit, push the branch and open a pull request. Open the pull request from the workspace to review it and its checks. When you're ready and the checks allow it, select **Merge PR**. After the merge, **Archive** puts the conversation away.

Trying this with a local-only repository? Select **Commit** to have the agent save the edit on the workspace branch.
