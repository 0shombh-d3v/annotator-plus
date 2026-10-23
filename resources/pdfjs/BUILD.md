# Pinned PDF.js assets

Version: **6.2.108**, upstream build `0365cbde0`.

The display library and worker come from the official npm package `pdfjs-dist@6.2.108`, paths `legacy/build/pdf.mjs` and `legacy/build/pdf.worker.mjs`. Both include upstream runtime polyfills. The generic viewer application and supporting assets remain the same pinned version, with the offline policy changes documented and checked by `scripts/verify-release.mjs`.

Source: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.2.108.tgz

Before release packaging removes source-map references, the compatibility files have these SHA-256 hashes:

- `pdf.mjs`: `842284e0d1d439e60701e3355c2128cd3016ebebf14220e27f512467682aad66`
- `pdf.worker.mjs`: `b4e582882f5e811f4d1b7b511f68d9a0c3209141e6f68856f01408c5cc155131`

Do not replace these with the unpolyfilled `build/` files. On older Chromium runtimes, missing `Math.sumPrecise` causes embedded font conversion to fail, which replaces mathematical symbols and changes typefaces even though the PDF otherwise opens.

`src/pdfWorker.ts` restores native module workers after the iframe library's classic-worker shim. Only the exact bundled worker URL is allowed. `useWorkerFetch: false` routes CMaps, fonts, and decoder resources through the viewer's offline fetch bridge. `tests/pdfCompatibility.test.ts` checks the worker in a realm with missing APIs, and release verification checks both embedded compatibility files.

Keep the upstream license and font notices with these files.
