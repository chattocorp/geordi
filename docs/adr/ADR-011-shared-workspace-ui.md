# ADR-011: Share workspace components with the website

**Date:** 2026-11-19

## Context

The website demo repeated the markup for the forge's action ribbon and changed files. A change to the forge could leave the public demo showing old labels, actions, or file states.

## Decision

The forge and website import the same Svelte components and action rules from the private workspace package `@geordi/ui`. Shared components accept data and callbacks. The forge owns its live subscriptions and commands. The demo supplies sample Git and pull request data and handles actions locally.

Astro builds the website as static assets. It renders the demo in its final state at build time and hydrates it when it enters view. The rest of the landing page can still use Astro components.

## Consequences

The shared components use the existing design tokens and utilities (ADR-005). Both builds scan the package for Tailwind classes, and changes to the package trigger a website deployment. The forge's Storybook exercises the same components that the demo imports.
