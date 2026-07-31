# Quire v0.0.2 acceptance matrix

This document is the release boundary for the 0.0.2 update. Checked rows have reproducible local evidence; publication rows remain open until the final commit is pushed and its CI run passes.

## Release scope

- [x] Set the extension and package version to `0.0.2`.
- [x] Ship the single-`M` icon consistently at all required extension sizes.
- [x] Provide five global English and five Simplified Chinese Chrome Web Store screenshots.
- [x] Validate every screenshot as 1280×800, 24-bit RGB PNG without alpha.
- [x] Provide localized store listing copy and accurate permission/privacy disclosures.
- [x] Keep install-time permissions and optional host-access behavior unchanged.

## Reader localization

- [x] Localize the built-in welcome document and its document outline.
- [x] Localize remote URL validation, HTTP failure, and file-size errors without coupling core errors to one language.
- [x] Localize navigation, close, notification, unavailable-resource, and command-description accessibility text.
- [x] Verify that switching to Simplified Chinese updates both controls and the rendered welcome document.

## Release controls

- [x] Derive package, source, and Firefox test archive names from `package.json` instead of a hard-coded release number.
- [x] Reject a release tag that does not exactly match `v` plus the package version.
- [x] Run store-asset validation in both CI and the release workflow.
- [x] Reproduce the packaged Firefox build byte-for-byte from the source archive.

## Verification evidence

- [x] TypeScript compilation and all 51 unit/component tests pass.
- [x] Chrome and Firefox production builds and 0.0.2 archives pass manifest/package validation.
- [x] The installed Chromium extension passes the complete reader E2E flow.
- [x] The Firefox source archive reconstructs all 133 packaged files byte-for-byte.
- [x] The release guard accepts `v0.0.2` and rejects `v0.0.1`.
- [ ] GitHub CI passes on the final 0.0.2 commit, including installed Firefox action, context-menu, and native-shortcut tests.
- [ ] Create and push the annotated `v0.0.2` tag only after every preceding gate passes.
