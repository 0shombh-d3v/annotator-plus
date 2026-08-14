# Security policy

## Supported versions

Only the latest Annotator+ release receives security fixes.

## Security boundary

Annotator+ accepts one exact vault-relative PDF path. It rejects URLs, absolute paths, traversal, lists, and non-PDF targets. Its embedded reader uses bundled assets, blocks external navigation and network requests, and disables PDF JavaScript. A compromised Obsidian installation, malicious third-party plugin, or operating-system account is outside this plugin's isolation boundary.

## Reporting a vulnerability

Please use GitHub's **Security → Report a vulnerability** flow for this repository. Do not open a public issue for an unpatched vulnerability and do not include private vault content or documents.

Include the affected version, impact, reproduction steps, and a minimal proof of concept. You should receive an acknowledgement within seven days. A fix and disclosure timeline will be coordinated according to severity.

For ordinary bugs without a security impact, use the public issue tracker. Please test against the latest release before reporting.
