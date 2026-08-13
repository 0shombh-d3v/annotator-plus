# Changelog

## 0.3.2 — 2026-08-13

- Restored the proven PDF reader and Hypothesis client after 0.3.0–0.3.1 broke the annotation sidebar, highlights, and notes.
- Added compatibility for the forked `annotator-plus` plugin ID without changing existing annotation data.
- Added release checks for the reader, note indicators, appearance policy, and sidebar compatibility bridge.
- Rolled back the 0.3.0 reader/security rewrite; its protections will return only after the full annotation UI passes integration testing.

## 0.3.1 — 2026-08-13

- Fixed the black screen caused by upgraded PDF.js resources using outdated bundled paths and browser APIs.
- Restored bundled PDF worker loading and annotation-sidebar resources while keeping PDF document scripting disabled.

## 0.3.0 — 2026-08-13

- Forked Obsidian Annotator as **Annotator+** with a separate plugin ID.
- Added persistent dark-red PDF underlines for highlights containing written notes, including zoom/rotation stability and keyboard activation.
- Added **All / Notes** sidebar filtering while keeping **Page Notes** separate.
- Added live **Follow Obsidian / Always dark / Always light** appearance modes and higher-contrast dark-mode highlights.
- Removed experimental web and video annotation modes.
- Updated PDF.js, disabled document scripting, restricted annotation targets, validated local API messages, serialized vault writes, and hardened cross-frame messaging.
- Vendored the modified Hypothesis client into this repository and added full CI and release verification.

For history before 0.3.0, see the [original Obsidian Annotator releases](https://github.com/elias-sundqvist/obsidian-annotator/releases).
