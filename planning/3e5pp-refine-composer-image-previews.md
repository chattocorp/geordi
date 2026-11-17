---
data:
  priority: normal
  status: done
  type: feature
id: 3e5pp
title: Refine composer image previews
---
Follow-up to 03wjd. Implemented image attachments above the text in one horizontally scrolling row. Thumbnails preserve aspect ratios without cropping, with a fixed height and capped width for very wide images. Quiet contrasting surfaces and outlines separate images from the composer. Full-size preview links and smaller remove controls support mouse and keyboard; touch screens always show removal controls.

Verified with pnpm check, pnpm lint, pnpm test (402 tests), and sweet doctor. Browser stories cover wide and tall images, panoramic containment, horizontal overflow, placement above the text, preview links and keyboard removal. Visually checked the dark composer and verified mouse and touch removal in the light composer. Updated FDR-001 and added a release note.