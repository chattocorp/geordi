# ADR-005: A design system of tokens, utilities and components

**Date:** 2026-11-14

## Context

The UI grew feature by feature, each view styling itself with raw Tailwind classes. The same patterns (cards, composers, buttons, badges, tabs) were written out again and again with small differences, and there was no place to see them side by side. Two invariants make this matter: the UI should stay calm (few sizes, few shapes, one accent), and new features should look like they belong without anyone having to remember how the last one was styled.

## Decision

The design system has three layers, each built on the one before, and all of it lives in the web app:

1. **Tokens** in `apps/web/src/routes/layout.css`: semantic colours for light and dark mode, one text and one code typeface (IBM Plex Sans and JetBrains Mono, 16px base), four font sizes, and two radii plus the pill.
2. **Utilities** in the same file, declared with Tailwind's `@utility` and named for what a thing is (`card`, `item`, `pane-bar`, `title`, `code`, `dot`, …). They cover patterns that are only styling.
3. **Components** in `apps/web/src/lib/ui/` for patterns with behaviour or structure (`Button`, `Badge`, `Composer`, `Notice`, `Page`, `Panes`, `Split`). They know nothing about Geordi's domain; components that do live in `src/lib/components/`.

- **Storybook** documents all three layers. Every component in `lib/ui` has stories, and the foundations (colour, type, shape) have their own.
- **Stories are tests:** the test suite renders every story in a real browser and fails on errors.
- Views use tokens, utilities and components. Raw Tailwind remains for layout (flex, grid, spacing); a visual pattern that appears a second time becomes a utility or a component.

## Consequences

- One place to change how something looks, and one place to see everything.
- Arbitrary values (`text-[13px]`, `rounded-[10px]`, raw colours) are a smell: either a token is missing, or the design is drifting.
- Running the tests needs a browser (Playwright's Chromium), which makes them heavier to set up than before.
- Storybook and its add-ons are a sizeable set of development dependencies to keep up to date.
