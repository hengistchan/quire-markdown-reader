# Quire v0.0.6 acceptance matrix

This document is the iteration and release boundary for the 0.0.6 update. Checked rows require reproducible evidence from the final release candidate. Publication rows remain open until the final commit is pushed, its CI run passes, and publication is explicitly authorized.

## Release identity and product boundary

- [x] Set the extension, package, lockfile, documentation, changelog, issue template, and release guard target to `0.0.6`.
- [x] Preserve Quire's single purpose as a focused, read-only Markdown reader and local document workspace.
- [x] Keep `activeTab`, `contextMenus`, `scripting`, and `storage` as the only required permissions.
- [x] Keep HTTP, HTTPS, and local-file access optional and user initiated.
- [x] Add no account, analytics, advertising, tracking, developer backend, or remote-code behavior.

## Recent Resources

- [x] Keep Recent Resources separate from document Reading History and its scroll or heading restoration metadata.
- [x] Record only explicit Open File, Open Folder, and Open URL actions.
- [x] Do not create resources for workspace-internal navigation, relative links, Back/Forward, outline jumps, search jumps, or reading restoration.
- [x] Persist local-file, workspace, and remote resources with stable identities, deduplication, move-to-front ordering, and normalized remote URLs.
- [x] Retain up to 30 resources, show the first five in the Open menu, and search the complete list from the command center.
- [x] Reopen a workspace at its last document, recover permission through an explicit user action, handle missing local handles, and allow individual removal.

## Diagrams and reader interaction

- [x] Expand Mermaid diagrams into a focused lightbox without losing the original rendered diagram.
- [x] Support pointer drag, touch drag, pinch zoom, toolbar zoom, keyboard movement, reset, close, and reduced-motion behavior.
- [x] Preserve deferred rendering, semantic light/dark Mermaid themes, cached rendering, and responsive overflow safety.
- [x] Keep expanded controls keyboard accessible with localized labels and deterministic cleanup.

## Workspace and reading layout

- [x] Raise file-tree and document-outline text from the smallest utility scale to the 12 px UI scale with readable line height.
- [x] Collapse or expand every nested workspace folder from one header control while preserving individual folder toggles.
- [x] Keep custom page width in the 560–980 px range and make the distinct 1200 px Wide View the default.
- [x] Disable Wide View when the page-width slider changes, preserve the saved custom width, and keep Wide View effective at the 980 px slider maximum.
- [x] Preserve an explicit existing standard-width preference when loading current-schema settings.
- [x] Maintain 16 committed light/dark visual-regression baselines, including Recent Resources and the document outline.

## Reproducible verification evidence

- [x] `npm run release:verify -- v0.0.6` passes and rejects a mismatched tag.
- [x] TypeScript compilation and all unit/component tests pass on the final 0.0.6 candidate.
- [x] Chrome and Firefox builds and ZIPs pass bundle budgets and package validation.
- [x] The Firefox package is reconstructed byte-for-byte from the source archive.
- [x] Store artwork and all localized screenshots pass validation.
- [x] Installed Chromium passes Recent Resources, navigation, diagram, workspace, width, and permission-recovery flows.
- [x] Light and dark visual regression passes against the committed baselines.
- [x] Installed Firefox passes toolbar, context-menu, recent-resource, localization, and native-shortcut flows.
- [x] GitHub CI passes on the final 0.0.6 release commit.
- [x] Create and push the annotated `v0.0.6` tag only after every preceding gate passes and publication is explicitly authorized.

Local release evidence on 2026-08-11: the release guard accepted `v0.0.6` and rejected `v0.0.5`; TypeScript compilation and 36 files with 242 unit/component tests passed; Chrome and Firefox builds and ZIPs passed bundle and package validation; all 143 Firefox package files were reproduced byte-for-byte from the source archive; all ten localized store screenshots and store disclosures passed; five installed-Chromium E2E flows and both non-update visual-regression tests passed. Firefox ESR 140.13.0 in a temporary Debian container passed local-file opening, Recent Resource reopening, localization, toolbar action, context menu, and native-shortcut flows. The macOS host has no usable Firefox installation, so the disposable Linux container is the local Firefox evidence.

The release candidate branch CI run [31507784232](https://github.com/hengistchan/quire-markdown-reader/actions/runs/31507784232), pull request CI run [31508493528](https://github.com/hengistchan/quire-markdown-reader/actions/runs/31508493528), and final `main` CI run [31508921246](https://github.com/hengistchan/quire-markdown-reader/actions/runs/31508921246) all passed the complete release gate. Pull request [#1](https://github.com/hengistchan/quire-markdown-reader/pull/1) was merged as `833b960041aea779b67a665f0bf4f8ab208b0916`.

After the final `main` CI passed and publication was authorized, annotated tag `v0.0.6` was pushed with peeled target `833b960041aea779b67a665f0bf4f8ab208b0916`. Release workflow run [31509372545](https://github.com/hengistchan/quire-markdown-reader/actions/runs/31509372545) repeated the complete gate and published [Quire v0.0.6](https://github.com/hengistchan/quire-markdown-reader/releases/tag/v0.0.6) as a non-draft, non-prerelease release with Chrome, Edge, Firefox, and source ZIP assets.
