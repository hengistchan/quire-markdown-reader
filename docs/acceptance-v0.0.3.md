# Quire v0.0.3 acceptance matrix

This document is the release boundary for the 0.0.3 update. Checked rows require reproducible local evidence from the final release commit. Publication rows remain open until that commit is pushed and its CI run passes.

## Release identity and product boundary

- [x] Set the extension, package, lockfile, documentation, and release guard to `0.0.3`.
- [x] Preserve Quire's single purpose as a focused, read-only Markdown reader and local document workspace.
- [x] Keep `activeTab`, `contextMenus`, `scripting`, and `storage` as the only required permissions.
- [x] Keep HTTP, HTTPS, and local-file access optional and user initiated.
- [x] Treat `.mdx` as ordinary Markdown without executing JSX, imports, expressions, remote scripts, or remote WASM.

## Document sources and session safety

- [x] Isolate simultaneous active-page and local-address imports with random, single-use handoff IDs.
- [x] Consume only the handoff named in the Viewer URL and expire abandoned handoffs after ten minutes.
- [x] Represent welcome, imported, local-file, workspace-file, and remote documents with a discriminated `DocumentSession`.
- [x] Use source adapters for local files, workspaces, and remote URLs without leaving incompatible source state behind.
- [x] Stream remote responses with a byte limit, timeout, cancellation, retry, offline pause, and refresh backoff.
- [x] Bound and cancel workspace scans, ignore common dependency/build directories, and refresh the file tree explicitly.

## Reading and navigation

- [x] Preserve native `Cmd/Ctrl+F` and implement the displayed platform-specific open shortcuts.
- [x] Search current-document content and workspace filenames, then scroll to and highlight the selected result.
- [x] Deduplicate a workspace file when it also appears in recent documents.
- [x] Keep fragments and relative Markdown navigation in the current reader while opening external links safely.
- [x] Restore reading position by document identity with continue and restart choices.
- [x] Provide back, forward, breadcrumb, and browser-history navigation across workspace documents.
- [x] Accept explicitly dropped Markdown files or folders and pasted Markdown text.
- [x] Print documents without navigation, overlays, progress UI, or clipped code and tables.

## Persistence and performance

- [x] Restore multiple same-named workspaces and individual local files through stable random IDs and on-device handles.
- [x] Version, validate, migrate, and recover reader settings and recent-document data.
- [x] Debounce settings and reading-position writes.
- [x] Avoid reparsing Markdown for typography, width, reading-aid, or locale-only changes.
- [x] Track long-document outline activity with `IntersectionObserver`.
- [x] Resolve relative local images and render Mermaid diagrams only near the viewport.
- [x] Cache Mermaid SVG results and split the Viewer shell from large cacheable dependencies.
- [x] Keep browser-test screenshots and traces out of the Firefox source-review archive.

## Chrome Web Store material

- [x] Provide five global English and five Simplified Chinese screenshots generated from the final 0.0.3 interface.
- [x] Validate every screenshot as 1280×800, 24-bit RGB PNG without alpha.
- [x] Keep the single-`M` icon, 440×280 promotional tile, and 128×128 store icon reproducible.
- [x] Keep the localized listing, permission explanations, privacy form, and privacy policy consistent with runtime behavior.
- [x] Prominently disclose all user-directed and on-device data handling under the Chrome Web Store policy enforced from August 1, 2026.
- [x] State that a selected remote website receives the ordinary direct request, while Quire has no developer backend or analytics.

## Reproducible verification evidence

- [ ] TypeScript compilation and all unit/component tests pass on the final 0.0.3 commit.
- [ ] Chrome and Firefox production builds pass manifest and package validation.
- [ ] The installed Chromium extension passes the complete reader E2E flow.
- [ ] The installed Firefox action and context-menu flow passes.
- [ ] The Firefox native shortcut flow passes in the Linux CI environment.
- [ ] The Firefox source archive reconstructs every packaged file byte-for-byte.
- [ ] The store artwork verifier passes all ten localized screenshots.
- [ ] The release guard accepts `v0.0.3` and rejects an older tag.
- [ ] GitHub CI passes on the final 0.0.3 commit.
- [ ] Create and push the annotated `v0.0.3` tag only after every preceding gate passes.
