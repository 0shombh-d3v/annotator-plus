# Changelog

## 0.4.3 — 2026-08-14

- Wait for PDF.js initialization before starting Hypothesis so fresh and newly rendered pages use native PDF anchoring.

## 0.4.2 — 2026-08-14

- Made published bundles use the committed, reviewed reader assets so platform-specific Tailwind output cannot change release bytes.
- Kept full clean reader rebuilds and upstream browser tests in CI.

## 0.4.1 — 2026-08-14

- Made Hypothesis asset manifest generation deterministic.
- Cleaned the vendored build directory before production builds and made release verification reject test/playground assets.

## 0.4.0 — 2026-08-14

- Rebuilt the PDF and annotation stack from pinned current sources: PDF.js 6.2.108 and Hypothesis client commit `b4d085a`.
- Replaced the fragile nested Via relay with a direct PDF.js reader and a public Hypothesis sidebar bridge.
- Restored the complete annotation sidebar, existing vault annotations, clickable dark-red note underlines, **All / Notes** filtering, and Obsidian Markdown rendering.
- Added live **Follow Obsidian / Always dark / Always light** appearance handling and a higher-contrast dark-mode highlight.
- Kept EPUB offline, updated Dark Reader to 4.9.128, and replaced remote icon fonts with native accessible controls.
- Removed frozen release-bundle and captured-site fallbacks; every release is now rebuilt and verified from the source in this repository.
- Hardened target fetching, annotation writes, release verification, CI, licensing, and deterministic packaging.

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
