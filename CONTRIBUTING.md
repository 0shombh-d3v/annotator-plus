# Contributing to Annotator+

Thank you for improving Annotator+. Bug reports, accessibility fixes, documentation corrections, and focused pull requests are welcome.

## Before opening an issue

Search [existing issues](https://github.com/0shombh-d3v/annotator-plus/issues), then include your Obsidian version, Annotator+ version, operating system, target type, reproduction steps, and relevant console errors. Do not post vault content or private documents. Report security issues using [SECURITY.md](SECURITY.md).

## Development setup

Requirements: Node.js 24, npm, Yarn 1.x, and Google Chrome for the vendored Hypothesis test suite.

```bash
git clone https://github.com/0shombh-d3v/annotator-plus.git
cd annotator-plus
npm ci --ignore-scripts
PUPPETEER_SKIP_DOWNLOAD=true yarn --cwd vendor/hypothesis-client install --frozen-lockfile --ignore-scripts
```

The Hypothesis client is ordinary source under `vendor/hypothesis-client`; there is no submodule or second repository.

## Checks and builds

```bash
npm run check
CHROME_BIN="/path/to/google-chrome" npm run check:vendor
npm audit --audit-level=high
npm run build
npm run release:verify
```

`npm run build` copies the validated runtime from `release/main.js`. This pins the PDF reader and Hypothesis client combination that passed the Obsidian smoke test. `npm run quick-build` remains available for source development, but do not replace the release runtime until the PDF, sidebar, highlights, **All / Notes** filter, and note indicators pass in Obsidian.

For local development, put the absolute destination plugin directory in `.vault_plugin_dir`, run `npm run dev`, and reload the plugin after a build.

## Pull requests

- Branch from `main` and keep the change focused.
- Add the smallest regression test that would fail without a non-trivial fix.
- Preserve local-first behavior, input validation, keyboard access, and upstream copyright notices.
- Run all applicable checks above and describe manual PDF/EPUB testing.
- Do not commit `node_modules`, `main.js`, local settings, vault data, or private documents.

By contributing, you agree that your contribution is licensed under [AGPL-3.0](LICENSE.TXT). Code derived from bundled projects remains subject to the notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
