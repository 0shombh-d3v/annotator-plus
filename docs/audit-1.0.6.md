# Annotator+ 1.0.6 final review

Reviewed all first-party plugin modules, annotation persistence and navigation, local resource and worker routing, reader lifecycle, the PDF.js selection patches, the customized Hypothesis sidebar, dependency checks, and release assembly. Live checks used Obsidian 1.14.4 on macOS, including its Chromium 142 engine, with two existing PDFs of 66 and 185 pages. Writes used a separate disposable annotation note; the original annotation notes and plugin settings were checked against their initial hashes and values. Private documents, notes, screenshots, and diagnostic files are excluded from this repository and the release.

## Confirmed defects repaired

| Area | Reproduction | Repair and regression coverage |
| --- | --- | --- |
| First selection after reopening | A native drag released in the margin could end at the page's annotation-layer or text-layer container. Finalizing that boundary selected the footer or collapsed the intended selection. | Resolve these observed PDF boundaries to the nearest real glyph before resetting selection helpers. Restrict the correction to selections anchored in tracked PDF text. Added forward and backward boundary cases using the bundled viewer and worker; all four fresh-reader native drag combinations passed in light and dark modes. |
| Tags | A pasted tag containing a comma reopened as two tags. CRLF notes also retained a structural carriage return in the displayed tag line. | Retain exact tag boundaries in the annotation JSON, while honoring manual changes to the editable Markdown tag line. Cover commas, Unicode, newlines, LF/CRLF, and manual edits. |
| Save/delete race | A PUT that read an annotation before a concurrent deletion could recreate it afterward. | Both PUT and PATCH merge and recheck existence inside the serialized atomic update. A deleted annotation returns 404 and its editor draft remains available. Deterministic race tests cover both methods; a live stale-editor save also retained the draft. |
| Markdown previews | An older asynchronous render could append its text to a newer annotation preview. A render failure could leave an empty preview and an active renderer. | Each render owns its target node and renderer. Old work stays detached; a current failure unloads its renderer and shows the current Markdown as readable plain text. Tests cover slow old renders, current failures, and stale failures. |
| Annotation links | Right-clicking an annotation link could navigate instead of leaving the context-menu interaction to Obsidian. | Navigate only for primary and middle clicks. Six cases cover the three mouse buttons in reading and editing views. |

## Verification

- `npm run check`: TypeScript, ESLint, 102 Jest tests, and 48 focused dependency/PDF browser tests passed.
- `npm run check:vendor`: formatting, type checking, and 4,274 vendored browser tests passed. The upstream browser harness emitted a ResizeObserver warning without a failing test.
- Total configured test count: **4,424**.
- `npm run audit:dependencies`: **zero advisories at every severity in both dependency trees**. Dependency versions were unchanged in this review.
- Full build from the vendored source, production rebuild after the fixes, embedded-resource verification, and release packaging.
- Twenty live workflow assertions covered creation, edits, replies, exact tags, timestamps, invalid writes, pagination, Markdown rendering, reply focus, rename, repeated reader/Markdown switching, deletion, and rejection of stale edits.
- Twenty checks across the two original PDFs covered theme-specific selection colors, preservation of canvas glyphs, fading and restoration of saved highlights during selection, unchanged annotation notes, and preservation of the open tabs.
- Native UI checks covered saving and reopening an annotation with Markdown and mathematics, a comma-containing tag, and retention of a failed stale edit. Fresh native selection was checked in both drag directions and both PDF themes.

The existing selection colors and canvas blending from 1.0.5 are retained. No PDF engine or annotation data migration is introduced by 1.0.6.

## Scope and repeatable checks

These results support closing the reported issues for the tested macOS session and documents. They do not establish that every PDF, operating system, theme, or upstream dependency is defect-free.

1. Reopen a PDF reader and select a highlighted line immediately, releasing in its margin. Repeat backward and in both PDF themes; the selection should stay on the intended text without including the footer.
2. Save an annotation with Markdown, mathematics, Unicode, and a comma inside one tag. Reopen the reader and confirm the preview and tag boundaries.
3. Switch an annotation note between Markdown and reader mode, rename it, and follow a link to a page-note reply. Confirm both open readers remain usable.
4. In a disposable note, leave an edit open while its saved annotation is deleted elsewhere. Saving must fail with the draft retained, without recreating the annotation.
5. Verify the published asset checksums and embedded resources before installation; verify existing note contents, settings, enabled plugins, and workspace after installation.
