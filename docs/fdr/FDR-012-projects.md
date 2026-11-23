# FDR-012: Projects

**Status:** Deprecated
**Last reviewed:** 2026-11-21

> **Deprecated (2026-11-21):** new projects can no longer be started. Existing projects still work and can be archived and restored; projects will be removed entirely in a later version.

## Overview

A project is a workspace that belongs to no repository. From it, an agent orchestrates Geordi for the person: they tell it what they want, and it starts agents in whichever repositories the work needs, supervises them, brings their results together and reports back. A project is for orchestrating; it is not a general place to chat.

## Behavior

- A project is started from the page for a new workspace: **New project** is the last choice where the repository is chosen. Projects have a section of their own in the sidebar, above the repositories, whose **+** opens that page with it chosen. Each shows what every workspace shows there: when its agent is at work, when it asks something, when it has come to rest unseen.
- There can be many projects, one per effort. A project is archived when its work is done, like any workspace.
- A project is a conversation with one agent, chosen with its model and effort as anywhere else (FDR-004). Further conversations can be started beside it, by the person or by its agent; they work in the project's folder too. Nothing else is there.
- Its agent works in a folder of its own that Geordi makes for the project: empty, not a Git repository, there for notes and anything it fetches. Pictures its agent writes there show in its replies, as anywhere. The folder stays when the project is archived, and is there again when it is restored.
- Its agent is told where it is: in a project, with no repository, there to orchestrate rather than to write code itself.
- The project's agent can do in Geordi what the person can (FDR-002): see every repository and workspace, start agents in any repository, start agents alongside the agent of any workspace in a repository, and message, steer, stop and archive any agent in a repository or in the project itself, whoever started it.
- Projects don't interact: a project's agents can't see, start agents in, message or archive another project.
- What it starts in a repository begins in a worktree of its own, from the repository's main branch, and appears under that repository in the sidebar as usual, marked as started by the project.
- A project has none of what follows from a repository: no changes, diffs, changeset, jobs, links or ports, no pull request actions, no setup or teardown.
- Archiving a project archives the conversations in it and ends their agents; its folder stays. The agents it started in repositories carry on where they are, without a parent.

## Design Decisions

### 1. A kind of workspace of its own, and looking like one

**Decision:** A project is a workspace without a repository, shown in its own section with its own name, not a repository workspace with features switched off.
**Why:** The repository's own workspace (FDR-009) was withdrawn because it looked like the others and behaved differently. A project is different on sight, so nobody expects a branch or changes there.
**Tradeoff:** Workspace code that assumes a repository has to learn that a workspace may have none.

### 2. Just conversations

**Decision:** A project shows its conversations and nothing beside them: no list of the agents it started, no terminals.
**Why:** The simplest shape first. The agent can say how the work stands when asked, and the sidebar already shows every workspace under its repository.
**Tradeoff:** No overview of a project's work at a glance; the person asks for one.

### 3. A folder of its own, never "no directory"

**Decision:** Every project gets an empty folder owned by Geordi, which outlives its archiving.
**Why:** Agents need a working directory. One per project keeps projects from touching each other or anything of the person's, with nothing to set up. Kept when archived, a restored project finds its notes again; they take next to no room.
**Tradeoff:** A project's agent can't work on files the person has elsewhere, short of being told where they are. Folders of archived projects stay on disk.

### 4. The person's reach

**Decision:** A project's agent may do in Geordi whatever the person may: across all repositories, and on any agent, not only those it started. The limits on nesting and on how many agents run at once still apply.
**Why:** The person works with it, and it acts for them. Rules about whose agent is whose would only stand between them and their own work.
**Tradeoff:** A project can interrupt, stop or archive work in a repository that it didn't start. Agents in repository workspaces can delegate across repositories and supervise their own descendants.

### 5. Projects keep to themselves

**Decision:** A project's agents see and touch no other project.
**Why:** Each project is its own effort. No agent is to stop, archive or otherwise touch another effort's work.
**Tradeoff:** Two projects can't hand work to each other; the person carries it over.

### 6. What a project starts lives with its repository

**Decision:** Agents a project starts show under their repository in the sidebar, like any other work there.
**Why:** Work on a repository is found under the repository, whoever started it.
**Tradeoff:** Nothing on screen gathers a project's agents in one place.

### 7. Many projects, archived when done

**Decision:** Projects are started and archived like other workspaces, rather than one permanent project.
**Why:** One effort per project keeps conversations short and focused, and avoids a conversation that only grows (FDR-009's clearing problem).
**Tradeoff:** Another list in the sidebar to keep tidy.

### 8. Called projects

**Decision:** These workspaces are called projects.
**Why:** It is what people bring to one: an effort with a goal, which may span repositories, or none.
**Tradeoff:** "Project" often means a repository elsewhere; here it is the opposite, work that belongs to none.

### 9. For orchestrating, not for chatting

**Decision:** Projects are designed and described for orchestrating. A project can be talked to about anything, but nothing is added for that.
**Why:** Geordi is an orchestrator; a general chat is somebody else's product. One clear purpose keeps the project calm and small.
**Tradeoff:** People who want a quick question answered outside any repository have a tool shaped for something else.

## Related

- **ADRs:** ADR-001, ADR-003, ADR-004
- **FDRs:** FDR-001, FDR-002, FDR-004, FDR-009
