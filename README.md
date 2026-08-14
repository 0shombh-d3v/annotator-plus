# Annotator+

[![CI](https://github.com/0shombh-d3v/annotator-plus/actions/workflows/ci.yml/badge.svg)](https://github.com/0shombh-d3v/annotator-plus/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/0shombh-d3v/annotator-plus)](https://github.com/0shombh-d3v/annotator-plus/releases/latest)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE.TXT)

Annotator+ is a private, local-first PDF and EPUB annotation plugin for Obsidian. It is a fork of [Obsidian Annotator](https://github.com/elias-sundqvist/obsidian-annotator) by [Elias Sundqvist](https://github.com/elias-sundqvist), with its original history and contributors preserved.

Annotations remain in the Markdown note that opened the document. Annotator+ does not require a Hypothesis account or upload annotations to the Hypothesis service.

## What Annotator+ adds

- A dark-red underline marks PDF highlights that contain a written note; plain highlights stay yellow only.
- Underlines remain crisp at every zoom level and support click and keyboard activation.
- The sidebar can switch between **All** highlights and **Notes** while keeping **Page Notes** separate.
- Appearance can follow Obsidian live, stay always dark, or stay always light.
- Dark mode uses a higher-contrast amber highlight while keeping the red note underline visible.
- Reader and annotation resources are bundled for offline use; annotation data remains in the vault note.

Annotator+ is desktop-only. PDF and EPUB are its primary supported targets.

## Install

### From a release

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/0shombh-d3v/annotator-plus/releases/latest).
2. Create `<vault>/.obsidian/plugins/annotator-plus/` and place both files inside it.
3. Reload Obsidian, then enable **Annotator+** under **Settings → Community plugins**.

The release also includes a ZIP and `SHA256SUMS`. [BRAT](https://github.com/TfTHacker/obsidian42-brat) users can add `0shombh-d3v/annotator-plus` directly.

## Use

Add an `annotation-target` property to a Markdown note:

```yaml
---
annotation-target: PDFs/my-book.pdf
---
```

The target may be a vault path, a `file://` URL, or an HTTPS URL. Open the note menu and choose **Annotate**, then select text in the PDF or EPUB. Add text to a highlight to turn its PDF underline dark red. In the sidebar, choose **Notes** to see only highlights with written notes.

Annotator+ normally detects the file type from the extension. If necessary, add `annotation-target-type: pdf` or `annotation-target-type: epub`.

Use **Open as Markdown** to inspect or edit the stored blocks. Text in the `%%COMMENT%%` region may be edited freely. Avoid changing annotation IDs or the JSON/selector structure. Renaming a target file breaks its existing association unless the note's `annotation-target` is updated.

## Appearance

Under **Settings → Annotator+ → Annotator appearance**, choose:

- **Follow Obsidian** (default): changes immediately with Obsidian's theme.
- **Always dark**.
- **Always light**.

No Obsidian restart is required.

## Privacy and security

- Annotations are stored in your vault note, not in a remote annotation account.
- Bundled reader resources run locally. HTTPS is used only when the configured annotation target itself is remote.
- Keep remote targets and documents limited to sources you trust.

Treat PDFs and EPUBs from unknown sources as untrusted files and keep Obsidian and Annotator+ updated. See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## Build and contribute

Source, vendored reader code, tests, and release automation all live in this one repository. See [CONTRIBUTING.md](CONTRIBUTING.md). Release notes are in [CHANGELOG.md](CHANGELOG.md), and bundled-project attribution is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The 0.4.6 reader stack is reproducibly pinned to PDF.js 6.2.108, Hypothesis client commit `b4d085a2f893aa6de3b61d8b8bc3ae4d0f24fc1a`, and Dark Reader 4.9.128. These are bundled locally; Annotator+ does not download executable code at runtime.

## Credits and license

Annotator+ would not exist without the work of Elias Sundqvist and every [Obsidian Annotator contributor](https://github.com/elias-sundqvist/obsidian-annotator/graphs/contributors), the [Hypothesis client](https://github.com/hypothesis/client), [PDF.js](https://github.com/mozilla/pdf.js), [Dark Reader](https://github.com/darkreader/darkreader), and their contributors.

The fork is distributed under the [GNU Affero General Public License v3.0](LICENSE.TXT), matching the original project. Bundled components retain their own licenses and copyright notices.
