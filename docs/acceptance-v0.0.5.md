# Quire v0.0.5 acceptance matrix

This document is the iteration and release boundary for the 0.0.5 update. Checked rows require reproducible evidence from the final candidate. Publication rows remain open until the package version is bumped, the final commit is pushed, and its CI run passes.

## Release identity and product boundary

- [x] Set the extension, package, lockfile, documentation, changelog, and release guard to `0.0.5` after the release candidate is approved.
- [x] Preserve Quire's single purpose as a focused, read-only Markdown reader and local document workspace.
- [x] Keep `activeTab`, `contextMenus`, `scripting`, and `storage` as the only required permissions.
- [x] Keep HTTP, HTTPS, and local-file access optional and user initiated.
- [x] Add no developer backend, account, analytics, advertising, tracking, or remote-code behavior.

## Navigation and restoration

- [x] Route Workspace, Local, Remote, and Imported documents through one navigation contract.
- [x] Use one navigation-operation `AbortController` and pass its signal through every restore source.
- [x] Check cancellation before committing document, history, recent-item, or workspace UI state.
- [x] Keep a newer Remote navigation when a delayed Workspace or Local restore completes.
- [x] Reflect supported workspace and embedded local-file navigation in the address bar without direct cross-origin `file://` iframe access.
- [x] Keep remote fragments separate from history URLs and make permission recovery an explicit user action.

## Rendering and interaction

- [x] Render sanitized raw HTML by default while preserving an explicit setting opt-out.
- [x] Repair malformed smart-quote and nested Markdown URL attributes without allowing unsafe URLs.
- [x] Float the code-copy action over a code block on hover or keyboard focus and recover when Clipboard API access is blocked.
- [x] Provide Mermaid pan, zoom, reset, and drag controls, including dragging at the default zoom level.
- [x] Re-render Mermaid diagrams with semantic light and dark theme variables while keeping deferred rendering and caching.
- [x] Preserve workspace-relative local images through the extension resource bridge.

## Visual system and store material

- [x] Use semantic light and dark surfaces, text, border, interaction, accent, focus, and status tokens.
- [x] Meet the automated text, action, icon, accent, and focus-ring contrast thresholds in both themes.
- [x] Keep document, table, code, diagram, workspace, command-center, and settings layouts inside 1280, 1024, 720, and 480 px viewports.
- [x] Maintain twelve visual-regression baselines for the theme gallery in light and dark appearances.
- [x] Recolor the reproducible SVG and 16/32/48/96/128 px PNG icons to the warm paper-and-terracotta system.
- [x] Generate each localized store set with four light screenshots and one dark screenshot while preserving its content and order.
- [x] Keep all ten screenshots at 1280×800, 24-bit RGB without alpha, and keep the store icon and promotional tile reproducible.

## Reproducible verification evidence

- [x] TypeScript compilation and all unit/component tests pass on the current 0.0.5 candidate.
- [x] Chrome and Firefox builds, ZIPs, bundle budgets, package validation, source reconstruction, and store verification pass.
- [x] Installed Chromium passes the complete reader, navigation-race, and permission-recovery E2E flows.
- [x] The light and dark visual-regression suite passes against the committed baselines.
- [x] Installed Firefox passes toolbar, context-menu, and native-shortcut flows.
- [x] GitHub CI passes on the 0.0.5 release candidate.
- [x] Create and push the annotated `v0.0.5` tag only after every preceding gate passes and publication is explicitly authorized.

Release evidence on 2026-08-08: TypeScript compilation, 32 files and 213 unit/component tests, Chrome and Firefox packaging, bundle and package validation, byte-for-byte Firefox source reconstruction, all ten store assets, four installed-Chromium E2E flows, and both non-update visual-regression tests passed locally and in CI. Linux CI run [31247499096](https://github.com/hengistchan/quire-markdown-reader/actions/runs/31247499096) also passed the installed-Firefox toolbar, context-menu, and native-shortcut gates. The local macOS Firefox launch was unavailable at the GeckoDriver/Marionette handshake, so the successful Linux CI run is the Firefox release evidence.
