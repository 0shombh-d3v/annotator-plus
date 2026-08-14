## Summary

<!-- What changed and why? -->

## Validation

- [ ] `npm run check`
- [ ] `npm run check:vendor` when vendored reader code changed
- [ ] `npm audit --audit-level=high`
- [ ] `npm run build && npm run release:verify`
- [ ] Manual Obsidian PDF smoke test

## Safety

- [ ] The vault-only PDF and fail-closed offline boundaries remain intact.
- [ ] No private PDFs, vault notes, local paths, secrets, or generated `main.js` are committed.
