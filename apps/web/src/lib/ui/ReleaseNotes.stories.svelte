<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ReleaseNotes from '@geordi/ui/ReleaseNotes.svelte';
	import changelog from '../../../../../CHANGELOG.md?raw';

	const { Story } = defineMeta({ title: 'UI/ReleaseNotes', component: ReleaseNotes });

	const sections = `## 1.2.0

### Highlights

- Agents can now review each other's work. ([#12](https://example.com/12))

### Features

- Ask an agent to start a reviewer in its child's worktree. ([#12](https://example.com/12))

### Fixes

- The \`geordi\` command finds a free port when its own is taken.

### Smaller changes

- The model picker has even padding around the agent icon.
- Sidebar actions show the same spinner as the ribbon.
`;
</script>

<Story name="Highlights and smaller changes" args={{ changelog: sections }} />

<Story
	name="Geordi's changelog"
	args={{ changelog: import.meta.env.GEORDI_UNRELEASED_NOTES + changelog }}
/>
