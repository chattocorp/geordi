---
data:
  priority: normal
  status: done
  type: bug
id: bewvx
title: Keep headless browser tests off the Mac audio device
---
macOS attributed a microphone prompt to Geordi when Playwright opened the audio device. Playing a silent tone reproduced the prompt. With Chromium's virtual audio output, the same playback produced no permission prompt. Geordi's Storybook tests, website tests and Open Graph screenshot now use virtual output.