# Changelog

## 1.0.3 — 2026-10-24

- Keep native PDF text selections and the Annotate/Highlight popup visible when sidebar layout notifications reapply an unchanged zoom preset.
- Continue clearing selections when the page scale actually changes. Cover numeric, automatic, page-fit, and page-width zoom modes with the actual bundled viewer in a browser regression.

## 1.0.2 — 2026-10-24

- Preserve original PDF fonts while selecting text in dark mode, and remove selected line-break marks from the page margin.
- Preserve the PDF.js text layer through zoom and layout resets so its selection renderer keeps following the visible page.
- Keep text selectable when a PDF first loads in a background tab; avoid caching a zero minimum font size from its hidden layout.
- Replace Showdown in annotation previews and HTML exports with Marked, preserving sanitized Markdown, formula rendering, heading IDs, links, and plain-paragraph export behavior.
- Update KaTeX, Cheerio/nth-check, AJV, diff, path-to-regexp, Zod, and http-cache-semantics to versions outside the reported advisory ranges.
- Require clean audits of both dependency trees in CI and release builds. Check Yarn's report contents because its exit status alone does not indicate findings.
- Add bounded parser attack regressions and legitimate rendering, routing, validation, and cache-policy controls.

## 1.0.1 — 2026-10-24

- Restore embedded fonts, mathematical symbols, and correct text rendering with PDF.js compatibility builds in both the viewer and worker.
- Use native bundled module workers and return resource reads through the offline bridge; dispose workers when readers close.
- Keep existing PDF panes intact when following annotation links, wait for sidebar readiness, and reveal highlights hidden by the Notes filter.
- Save replies to page notes and open reply links in the correct, expanded parent thread.
- Recognize bundled sidebar URLs with configuration fragments when reopening readers, preventing blank sidebars.
- Stop the embedded client on close, scope sidebar bootstrap declarations to prevent redefinition errors, and avoid invalid highlight geometry in hidden tabs.
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
