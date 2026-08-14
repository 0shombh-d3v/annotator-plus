# Contributing to Annotator+

Thank you for improving Annotator+. Bug reports, accessibility fixes, documentation corrections, and focused pull requests are welcome.

## Before opening an issue

Search [existing issues](https://github.com/0shombh-d3v/annotator-plus/issues), then include your Obsidian version, Annotator+ version, operating system, reproduction steps, and relevant console errors. Do not post vault content or private documents. Report security issues using [SECURITY.md](SECURITY.md).

## Development setup

Requirements: Node.js 24, npm, and a Chromium-compatible browser for the vendored Hypothesis test suite. The repository includes the pinned Yarn 3.6.0 executable used by the Hypothesis source tree.

```bash
git clone https://github.com/0shombh-d3v/annotator-plus.git
cd annotator-plus
npm ci --ignore-scripts
(cd vendor/hypothesis-client && node .yarn/releases/yarn-3.6.0.cjs install --immutable)
node vendor/hypothesis-client/node_modules/playwright/cli.js install chromium
```

The Hypothesis client is ordinary source under `vendor/hypothesis-client`; there is no submodule or second repository.

## Checks and builds

```bash
npm run check
npm run check:vendor
npm audit --audit-level=high
npm run build
npm run release:verify
npm run release:package
```

`npm run build` compiles the vendored Hypothesis source, removes development-only assets, and then builds `main.js` with all reader resources embedded. There is no frozen release bundle or second repository. `npm run quick-build` rebuilds the plugin around the existing generated Hypothesis assets and is intended only for local iteration.

The current reader pins are PDF.js 6.2.108, Hypothesis client commit `b4d085a2f893aa6de3b61d8b8bc3ae4d0f24fc1a`, and Dark Reader 4.9.128. Update one reader component at a time, preserve its license, and repeat both automated checks and the Obsidian PDF smoke test before changing a pin.

For local development, put the absolute destination plugin directory in `.vault_plugin_dir`, run `npm run dev`, and reload the plugin after a build.

## Pull requests

- Branch from `main` and keep the change focused.
- Add the smallest regression test that would fail without a non-trivial fix.
- Preserve the vault-only PDF boundary, fail-closed resource routing, keyboard access, and upstream copyright notices.
- Run all applicable checks above and describe manual PDF testing.
- Do not commit `node_modules`, `main.js`, local settings, vault data, or private documents.

By contributing, you agree that your contribution is licensed under [AGPL-3.0](LICENSE.TXT). Code derived from bundled projects remains subject to the notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
