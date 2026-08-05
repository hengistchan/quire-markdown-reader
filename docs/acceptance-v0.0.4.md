# Quire v0.0.4 acceptance matrix

This document is the release boundary for the 0.0.4 update. Checked rows require reproducible evidence from the final release commit. Publication rows remain open until that commit is pushed and its CI run passes.

## Release identity and product boundary

- [x] Set the extension, package, lockfile, documentation, changelog, and release guard to `0.0.4`.
- [x] Preserve Quire's single purpose as a focused, read-only Markdown reader and local document workspace.
- [x] Keep `activeTab`, `contextMenus`, `scripting`, and `storage` as the only required permissions.
- [x] Keep HTTP, HTTPS, and local-file access optional and user initiated.
- [x] Add no new data collection, developer backend, analytics, or remote-code behavior.

## 0.0.4 interaction fixes

- [x] Keep the document outline beside workspace folders and let users expand or collapse it like a folder.
- [x] Keep long outline lists scrollable without compressing headings or blocking main-document scrolling.
- [x] Navigate to an outline heading on the first click without competing scroll operations.
- [x] Keep the document surface stable through the end of long pages without trailing blank space.
- [x] Retry deferred Mermaid rendering after recoverable failures and avoid permanently empty diagrams.
- [x] Let first-level headings use the full reading-column width.
- [x] Open a folder from an embedded local `file://` preview while preserving the original address.
- [x] Keep a folder selected from a local-file preview session-only and disable unsupported automatic refresh.

## Chrome Web Store material

- [x] Regenerate five global English and five Simplified Chinese screenshots from the final 0.0.4 interface.
- [x] Validate every screenshot as 1280×800, 24-bit RGB PNG without alpha.
- [x] Keep the single-`M` icon, 440×280 promotional tile, and 128×128 store icon reproducible.
- [x] Keep the localized listing, permission explanations, privacy form, and privacy policy consistent with runtime behavior.
- [x] Confirm that 0.0.4 requests no permission beyond the published 0.0.3 permission set.

## Reproducible verification evidence

- [x] TypeScript compilation and all unit/component tests pass on the final 0.0.4 commit.
- [x] Chrome and Firefox production builds pass manifest and package validation.
- [x] The installed Chromium extension passes the complete reader E2E flow, including the local-file folder fallback.
- [x] The Firefox source archive reconstructs every packaged file byte-for-byte.
- [x] The store artwork verifier passes all ten localized screenshots.
- [x] The release guard accepts `v0.0.4`.
- [ ] GitHub CI passes on the final 0.0.4 commit, including installed Firefox action, context-menu, and native-shortcut flows.
- [ ] Create and push the annotated `v0.0.4` tag only after every preceding gate passes.

Local evidence on 2026-08-06: `npm run compile`, all 116 unit/component tests, Chrome and Firefox packaging, package validation, byte-for-byte source reconstruction, store verification, `v0.0.4` release validation, and the installed Chromium E2E flow passed. The annotated release tag must not be created from an unpushed commit or before its CI run succeeds.
