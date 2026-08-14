# Third-party notices

Annotator+ is a fork of [Obsidian Annotator](https://github.com/elias-sundqvist/obsidian-annotator), originally created by Elias Sundqvist and released under AGPL-3.0. The Git history preserves the original project and contributor record. Annotator+ modifications are copyright © 2026 Shombh and contributors and are released under the same license.

The distribution embeds or builds upon these projects:

| Component | Use | License / notice |
| --- | --- | --- |
| Obsidian Annotator | Original plugin implementation | AGPL-3.0; [LICENSE.TXT](LICENSE.TXT) |
| Hypothesis client (`b4d085a2f893aa6de3b61d8b8bc3ae4d0f24fc1a`) | Annotation guest and sidebar | BSD-2-Clause and noted subcomponents; [vendor license](vendor/hypothesis-client/LICENSE) |
| PDF.js 6.2.108 | PDF rendering | Apache-2.0 and bundled font notices; [bundled license](resources/pdfjs/LICENSE) |
| Dark Reader 4.9.128 | Dark appearance | MIT; [bundled license](resources/dark-reader/LICENCE) |
| epub.js | EPUB rendering | BSD-2-Clause |
| react-offline-iframe | Offline reader resource bridge | MIT |

The production `main.js` embeds the corresponding reader assets and their bundled license files. Releases are rebuilt from the vendored source and pinned assets in this repository; no prebuilt Annotator+ release bundle is used as build input.

This notice is informational; the corresponding license text controls where there is any conflict.
