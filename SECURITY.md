# Security policy

## Supported versions

Folio is currently pre-1.0. Security fixes are applied to the latest source revision and the newest published release.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Use the repository host's private vulnerability reporting feature when available, or contact the maintainers through the private security address listed by the repository once one is configured.

Include the affected version, browser, reproduction steps, impact, and any suggested mitigation. Avoid including personal documents or other sensitive data in a report.

The maintainers should acknowledge a complete report within seven days and coordinate disclosure after a fix is available. This timeline is a project goal, not a guarantee.

## Security model

- Markdown input is untrusted and sanitized before insertion into the viewer.
- Raw HTML is disabled by default.
- Mermaid uses strict security mode.
- Runtime dependencies are bundled with the extension.
- Local documents are read only after an explicit user action.
