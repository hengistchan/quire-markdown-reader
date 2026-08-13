# Quire v0.0.7 acceptance matrix

This document is the iteration and release boundary for the 0.0.7 update. Checked rows require reproducible evidence from the final release candidate. Publication rows remain open until the final commit is pushed, its CI run passes, and publication is explicitly authorized.

## Release identity and product boundary

- [x] Set the extension, package, lockfile, documentation, changelog, issue template, and release guard target to `0.0.7`.
- [x] Preserve Quire's single purpose as a focused, read-only Markdown reader and local document workspace.
- [x] Keep `activeTab`, `contextMenus`, `scripting`, and `storage` as the only required permissions.
- [x] Keep HTTP, HTTPS, and local-file access optional and user initiated.
- [x] Add no account, analytics, advertising, tracking, developer backend, or remote-code behavior.

## Workspace folder import

- [x] Include dot-prefixed Markdown files when scanning imported folders.
- [x] Continue to ignore hidden directories and dependency/build directories such as `.git`, `node_modules`, `dist`, `build`, `coverage`, `.next`, `.output`, `target`, and `vendor`.
- [x] Preserve sorted nested workspace trees, scan depth and item limits, cancellation, and refresh behavior.

## Reproducible verification evidence

- [x] `npm run release:verify -- v0.0.7` passes and rejects a mismatched tag.
- [x] TypeScript compilation and all unit/component tests pass on the final 0.0.7 candidate.
- [x] Chrome and Firefox builds and ZIPs pass bundle budgets and package validation.
- [x] The Firefox package is reconstructed byte-for-byte from the source archive.
- [x] Store artwork and all localized screenshots pass validation.
- [x] Installed Chromium passes the complete reader and recent-resource/navigation/restoration flows.
- [x] Light and dark visual regression passes against the committed baselines.
- [ ] Installed Firefox passes toolbar, context-menu, and native-shortcut flows.
- [ ] GitHub CI passes on the final 0.0.7 release commit.
- [ ] Create and push the annotated `v0.0.7` tag only after every preceding gate passes and publication is explicitly authorized.

Local release evidence on 2026-08-13: the release guard accepted `v0.0.7` and rejected `v0.0.6`; TypeScript compilation and 36 files with 243 unit/component tests passed; Chrome and Firefox builds and ZIPs passed bundle and package validation; all 143 Firefox package files were reproduced byte-for-byte from the source archive; all ten localized store screenshots and store disclosures passed; five installed-Chromium E2E flows and both non-update visual-regression tests passed. The macOS host has no usable Firefox installation, so the Linux release workflow is the Firefox release gate.
