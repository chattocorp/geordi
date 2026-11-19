---
type: feature
---

Type @ and a few letters in a prompt or reply to find a repository file. For example, @msgcomp matches MessageComposer.svelte. Each row highlights the matching letters and shows the file name beside its folder. Choose a file to insert its path. Large repositories are searched on the daemon so the picker receives only the best 40 matches. When you add, rename, or delete a file, the daemon updates the affected paths in its index. Your first file search after a daemon restart reuses the saved index and picks up changes made while Geordi was closed.
