# FDR-011: Diagrams and SVG in agent output

**Status:** Active
**Last reviewed:** 2026-11-18

## Overview

Agents explain things with diagrams: a flow, a sequence of messages, a chart they drew. Geordi
shows Mermaid diagrams and SVG in an agent's output as pictures, not as the code that
describes them, so the person reads the diagram rather than its source.

## Behavior

- A Mermaid code block in agent output is drawn as a diagram in its place, in Geordi's
  colours and type, in light and dark mode alike. A diagram too big for its space can be
  zoomed and moved within it.
- An SVG code block is shown as a picture in its place. Clicking it opens it at the size of
  the window, as other pictures do.
- A block that cannot be drawn (still coming in, or with a mistake in it) stays code, as
  written, until it can be.
- An SVG file the agent refers to as a picture (`![chart](chart.svg)`) is shown like the
  PNG, JPEG, WebP and GIF files it refers to.
- Diagrams and SVG never load anything from the web, and never run anything.

## Design Decisions

### 1. Mermaid is drawn by Pele, in the browser

**Decision:** Mermaid diagrams are drawn with Pele, loaded only when a diagram is shown,
and only the parts for the kinds of diagram shown.
**Why:** Pele is small, fast and synchronous, has no dependencies, and is themed with CSS
variables, so diagrams follow the colour mode without being drawn again. Mermaid itself is
several times its size and much slower.
**Tradeoff:** Pele's layout and look are its own, not Mermaid's; a diagram may look a
little different from the same one elsewhere.

### 2. Nothing drawn reaches the web

**Decision:** Pele is told to draw neither images nor links. An SVG from an agent, written
in its output or read from a file, is only ever shown as a picture, never put into the page.
Opened on its own, an SVG file is served so that it can run and load nothing.
**Why:** Agent output may be steered by prompt injection; displaying it must not send
anything anywhere, nor run anything in the forge's page. A browser shows an SVG picture
without its scripts and without loading what it refers to.
**Tradeoff:** Links in diagrams cannot be followed, and an SVG from an agent does not take
on Geordi's colours, as a Pele diagram does.

### 3. Code until drawn

**Decision:** What cannot be drawn is shown as code, without an error.
**Why:** Output arrives as it is written: a diagram is unfinished for most of that time, and
an error each time would be noise. Code is what was written, and still readable.
**Tradeoff:** A diagram with a mistake in it does not say what the mistake is.

### 4. No switch between diagram and source

**Decision:** A drawn block shows the diagram only, with no way to see its source.
**Why:** A calm screen (see the invariants in `CLAUDE.md`). The source is in the
conversation's own text, which can be copied.
**Tradeoff:** Reading the source of a diagram takes copying the message.

## Related

- **ADRs:** ADR-005 (design system)
- **FDRs:** FDR-001 (workspaces)
