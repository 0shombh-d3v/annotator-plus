# Annotator+ 1.0.1 audit

Audited the plugin source, local reader bridge, annotation persistence, vendored sidebar changes, packaged resources, release workflow, and the installed plugin in Obsidian 1.14.4 on macOS. Two local PDFs (66 and 185 pages) were used. Private documents, notes, screenshots, and local diagnostics are excluded from the repository and release.

## Diagnosed and repaired

| Area | Failure | Repair and evidence |
| --- | --- | --- |
| PDF rendering | The unpolyfilled PDF.js worker lacked `Math.sumPrecise`. Font conversion failed and mathematical glyphs and typefaces were substituted. The iframe library silenced the diagnostics. | Use pinned upstream compatibility builds in both realms. Verified embedded mathematical fonts and equations against a Poppler reference render, and added an isolated worker regression. |
| Worker execution | The iframe dependency wrapped a module worker as a classic worker and caused PDF.js to use a loopback worker on the main thread. | Restore a native module worker restricted to the bundled URL. Route resource reads through the viewer and terminate workers on reader disposal. |
| Navigation | An annotation link could replace the first PDF pane and try to scroll every reader. Reader startup and Notes filtering could hide the target. | Reuse the matching document, preserve other PDF panes, explicitly activate the target, wait for its bridge, and clear the Notes filter for focused annotations. |
| Saved data | CRLF and a final block ID without a newline were missed. One malformed JSON block stopped the entire load. | Accept both line endings and EOF, report damaged blocks while reading the remaining annotations, and preserve source text. |
| Annotation context | Display excerpts trimmed original selector whitespace. Indentation and literal marker lines in notes were fragile. | Preserve selector context, indentation, Unicode, paragraph breaks, and literal comment markers. |
| Local API | Reads and partial updates were unsupported; failed reads could fall through into unrelated resource routing. Modification times stayed stale. Snapshot-based patches could lose a simultaneous edit to another field. | Add scoped reads, pagination, partial updates, explicit errors, safe IDs, and creation/update timestamps. Serialize writes per vault and note, and merge patches inside the atomic update. |
| Renames and deletion | A reader retained its old save path and could recreate a note after rename or deletion. | Rebuild renamed readers and reject saves to missing notes. |
| Lifecycle and appearance | Slow loads could render after a newer load or closure. Detached reader references survived, and theme changes depended on indirect events. | Cancel stale work, invoke the embedded client's unload protocol, clear references and child renderers, stop workers, and observe the owning Obsidian window's theme directly. |
| Editor links and dragging | Editor links were paired by the order of visible aliases and could resolve against a stale source file. Drop handling depended on private CodeMirror internals. | Resolve links by document position and use the public editor information field and change iterator. Prepare drag metadata synchronously. |
| Plugin coexistence | Annotator+ and the original Annotator registered the same view type. | Use an Annotator+ view type and migrate legacy workspace states when the original plugin is disabled. |
| Page-note replies | The sidebar assumed every parent had a target entry. Reply links also selected a reply ID where thread filtering required the root ID, leaving an empty sidebar. | Fall back to the parent's document URI; select the root thread, open its tab, and expand all ancestors before focusing a reply. Cover real thread construction in regression tests. |
| Reopened sidebars | A sidebar link could resolve to its bundled blob URL with a configuration fragment. Exact URL matching rejected it and produced an empty document. | Match known resource URLs without their fragments and resolve the sidebar's bundled path for Markdown rendering. Unknown blobs and query variants remain blocked. |
| Reused iframe realms | Rewriting a sidebar document retained its global lexical bindings, so a second bootstrap could throw a duplicate declaration error. | Scope bootstrap declarations to an IIFE and test executing the shell twice in the same realm. |
| Hidden PDF highlights | Highlight geometry could divide by a hidden canvas's zero dimensions, producing invalid SVG coordinates and hiding the text-layer highlight. | Retain CSS highlighting when the canvas has no layout, with a browser regression and mounted fixtures for layout-dependent SVG tests. |
| Release assembly | The release workflow used existing generated sidebar assets after source changes. | Build the vendored reader from source before release verification and packaging. |

## Verification

- Plugin type checking, 87 regression tests, and ESLint.
- Vendored Hypothesis formatting, type checking, and 4,273 browser tests, including Notes-filter, page-note reply, and hidden-canvas regressions.
- Root npm dependency audit; compatible dependency updates and pinned development-SDK override.
- Vendored dependency review and compatible lockfile refresh, including patched Preact and DOMPurify. No critical advisories remain in that dependency tree. Remaining advisories in legacy development tools and upstream Markdown dependencies are tracked below.
- Full source build, embedded-resource verification, release packaging, and checksums.
- 43 live assertions using the actual local Obsidian session, its two original PDF notes, and isolated annotation-note copies, covering saves, replies, navigation, filtering, renames, failed writes, themes, workers, repeated reopening, and rendering. Original note contents, plugin settings, and the customized fallback plugin were verified unchanged against backup hashes.

## Dependency limitations at 1.0.1

The listed dependency advisories were addressed in 1.0.2. Both dependency trees are now checked with `npm run audit:dependencies`, including all severities, as part of CI and release builds. The following paragraph records the original 1.0.1 audit result.

The root npm audit is clean. The vendored upstream development tree is larger than the shipped plugin. Its remaining high-severity advisories include `nth-check` under Enzyme, `path-to-regexp` under the development server, and `http-cache-semantics` under the package/release tooling. These tools are excluded from the production reader bundle. Remaining moderate/low advisories include upstream Showdown (no patched version), older KaTeX, and development-only AJV/diff. Annotation comments use Obsidian's Markdown renderer in the installed plugin; the embedded reader also retains its offline CSP and resource boundary. This audit does not claim that upstream dependencies or arbitrary untested PDFs are defect-free.

## Repeatable manual checks

1. Open two different PDF annotation notes. Compare mathematical symbols and typography with a trusted render in light and dark modes.
2. Create a plain highlight, a highlight with a written note, and a page note. Confirm the Notes filter and underline apply to the written highlight only.
3. Save a note containing Unicode, paragraphs, and a formula; edit it, reply to the page note, then toggle Markdown/annotation mode and reload the plugin.
4. Follow a block link to the other PDF while Notes filtering is active. Verify both panes remain intact and the destination is active. Repeat with a modifier key to open a split.
5. Rename a test annotation note while it is open, save again, and verify the previous path is not recreated. Simulate a failed write and verify the draft and original saved content remain available.
6. Inspect the production package for local PDF, sidebar, font, and worker assets, and verify its checksum before deployment.
