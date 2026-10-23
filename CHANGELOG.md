# Changelog

## 1.0.1 — 2026-10-24

- Restore embedded fonts, mathematical symbols, and correct text rendering with PDF.js compatibility builds in both the viewer and worker.
- Use native bundled module workers and return resource reads through the offline bridge; dispose workers when readers close.
- Keep existing PDF panes intact when following annotation links, wait for sidebar readiness, and reveal highlights hidden by the Notes filter.
- Save replies to page notes and open reply links in the correct, expanded parent thread.
- Read CRLF and EOF annotation blocks, preserve selector whitespace and comment indentation, and recover other annotations when one block is damaged.
- Implement annotation reads, partial updates, pagination, explicit failed-save responses, and fresh modification timestamps. Prevent stale readers from recreating deleted or renamed notes.
- Cancel stale view loads, refresh renamed notes, follow Obsidian theme changes directly, and resolve editor links using CodeMirror document positions.
- Give Annotator+ its own view type and migrate old workspace views without conflicting with the original Annotator.
- Update vulnerable compatible build dependencies and rebuild the sidebar from source in the release workflow.

## 1.0.0 — 2026-08-14

- Released Annotator+ as a desktop-only, offline PDF annotation plugin for files stored inside the current Obsidian vault.
- Restricted `annotation-target` to one exact vault-relative `.pdf` path; URLs, absolute paths, traversal, lists, EPUBs, and other file types are rejected.
- Stored annotations in the Markdown note that opened the PDF, with no account, cloud sync, telemetry, or remote-document support.
- Added dark-red underlines for highlighted selections containing notes while keeping plain highlights yellow.
- Added **All / Notes** sidebar filtering while keeping whole-document **Page Notes** separate.
- Added live **Follow Obsidian / Always dark / Always light** appearance modes and accessible highlight contrast in both themes.
- Kept annotation indicators stable through zoom and rotation and made them clickable and keyboard-accessible.
- Bundled and pinned the PDF.js, Hypothesis, and Dark Reader stacks with fail-closed offline routing and Content Security Policies.
- Disabled PDF JavaScript, external navigation, external auto-links, model downloads, editing, printing, saving, and presentation mode.
- Added deterministic release packaging, full first-party and vendored test suites, release verification, checksums, CI, security guidance, and third-party attribution.
- Preserved the original Obsidian Annotator Git history, contributor record, and AGPL-3.0 license.
