# Annotator+ 1.0.7 review closeout

This release includes all fixes and verification described in the [1.0.6 final review](audit-1.0.6.md). A final reload-diagnostics check found an additional upstream iframe initialization race, repaired here before closing the review.

## Removed-frame initialization

The pinned `react-offline-iframe` wrapper awaits both HTML retrieval and HTML rewriting before installing its DOM patches. If the reader closes during either stage, its iframe can have a null `contentWindow` when initialization resumes. The observed error was an unhandled rejection accessing `HTMLLinkElement` on that removed frame. Existing generation checks protect the active reader but do not cancel the wrapper's own initialization.

The build now inserts a liveness check immediately after asynchronous preparation and before any frame patching or document write. It stops work when the frame is detached or has no window. Installed dependencies are not modified, and their versions are unchanged. The transform fails the build if its expected upstream initializer changes, so dependency upgrades require reviewing the correction.

Four regression tests execute the pinned dependency's actual initializer with controlled promises. The two removal cases failed with the observed null-window error before the fix. They now pass; a live iframe still receives its document, patches, and completion callback. A fourth check verifies that an unknown upstream initializer cannot silently omit the correction.

## Final verification

- TypeScript, ESLint, **102 Jest tests**, and **52 focused dependency/PDF/lifecycle tests** pass.
- Vendored formatting, type checking, and **4,274 browser tests** pass in CI. Total configured tests: **4,428**.
- Both dependency trees report **zero advisories at every severity**.
- Full source builds, release verification, packaging, published-asset checksums, ZIP contents, and embedded PDF assets are checked.
- Live checks cover the two original PDFs and their themes, native selection, and rapid reader disposal/reopening. Original note contents, settings, enabled-plugin configuration, and open tabs are checked after installation.

The 20 isolated annotation workflow assertions, native annotation saves, failed-draft retention, and four first-drag theme/direction combinations from the 1.0.6 review remain applicable: 1.0.7 changes the wrapper's initialization boundary only. No annotation format or PDF-selection behavior changes in this follow-up.

The tested environment remains Obsidian 1.14.4 on macOS with two PDFs. These checks support closing the reported issues in that environment; they do not establish that arbitrary PDFs, other platforms, or every upstream path are defect-free. Private notes, documents, screenshots, and diagnostics remain excluded from source control and release assets.
