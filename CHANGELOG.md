# Changelog

All notable changes to Quire are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.0.7] - 2026-08-13

### Fixed

- Included dot-prefixed Markdown files when scanning imported folders while continuing to ignore hidden directories and dependency/build directories

## [0.0.6] - 2026-08-11

### Added

- Added Recent Resources for explicitly opened local files, workspaces, and remote URLs without mixing them into per-document reading history
- Added five-item recent access in the Open menu, full recent-resource search in the command center, per-item removal, deduplication, and workspace last-file recovery
- Added expanded Mermaid lightboxes with mouse, touch, pinch, keyboard, pan, zoom, and reset interactions
- Added a workspace-header control that collapses or expands every nested folder in one action

### Changed

- Increased file-tree and document-outline typography while preserving compact row density and visual hierarchy
- Made the widest reading layout the default, separated the 560–980 px custom range from the 1200 px Wide View, and kept the saved custom width when toggling modes
- Extended light and dark visual-regression coverage to the Open menu and document-outline panel

### Fixed

- Prevented workspace-internal navigation, browser traversal, relative links, and reading-position restoration from creating duplicate Recent Resources
- Restored recent workspaces through explicit permission recovery and handled missing local handles without leaving stale document content
- Kept Wide View visibly effective after the page-width slider is changed to its maximum value

## [0.0.5] - 2026-08-08

### Added

- Added hover- and keyboard-accessible code-copy actions with a fallback for embedded pages where direct Clipboard API access is blocked
- Added Mermaid pan, zoom, reset, and drag controls while keeping diagrams lazily rendered and responsive to light or dark appearance changes
- Added a theme gallery, contrast checks, responsive overflow coverage, and twelve light/dark visual-regression baselines

### Changed

- Unified Workspace, Local, Remote, and Imported document navigation behind one cancellable history and restoration flow
- Enabled sanitized raw HTML by default for new and migrated settings while preserving an explicit opt-out
- Reworked the reader around semantic warm surfaces, accessible focus states, responsive layouts, and matching Mermaid colors
- Recolored the reproducible Quire icon and store artwork to the paper-and-terracotta visual system

### Fixed

- Reflected workspace and embedded local-file navigation in the browser address bar without violating `file://` origin restrictions
- Prevented delayed workspace, local-file, remote, or imported restores from replacing a newer navigation choice
- Repaired relative local-image loading through the extension bridge and malformed smart-quote or nested raw-HTML attributes
- Kept the code-copy action floating over the code block instead of reserving a toolbar row
- Stabilized installed-Firefox shortcut verification by waiting for the imported page identity before asserting navigation completion

## [0.0.4] - 2026-08-06

### Added

- Added an expandable document-outline tree beside workspace folders so long documents remain navigable without a separate floating panel
- Added a session-only folder chooser for local `file://` previews while preserving the original browser address

### Changed

- Allowed document titles to use the full reading-column width instead of limiting first-level headings to 19 characters
- Kept the document outline at the same hierarchy as workspace folders and made long outline lists independently scrollable

### Fixed

- Prevented blank space and broken page geometry after scrolling to the end of a document
- Made deferred Mermaid rendering recover from intermittent failures without leaving diagrams permanently empty
- Prevented outline navigation from disabling main-document scrolling or requiring repeated clicks to reach a heading
- Replaced the misleading folder-permission error shown when opening a workspace from an embedded local-file preview

## [0.0.3] - 2026-08-02

### Added

- Reading-position restoration with a choice to continue or restart, plus per-document heading and scroll metadata
- Back, forward, browser-history, and breadcrumb navigation for Markdown documents opened inside a workspace
- Direct Markdown drag-and-drop and clipboard-paste entry points, together with a dedicated print stylesheet
- Persistent identities for multiple local folders and individual files, including same-named workspaces and recent-item reopening

### Changed

- Replaced the global imported-document storage key with isolated, single-use document handoffs that expire after ten minutes
- Added platform-correct shortcut labels and implemented the displayed open-file, open-folder, and open-URL keyboard actions
- Bounded remote Markdown downloads with streamed byte limits, a 20-second timeout, active cancellation, retry actions, offline pausing, and exponential refresh backoff
- Added cancellable workspace scans with dependency/build-directory ignores, depth and item limits, plus an explicit workspace refresh action
- Unified source-specific document state behind a discriminated `DocumentSession`, shared source adapters, and one mutually exclusive overlay state
- Versioned and validated reader settings and recent-document data, with migration and recovery for older or damaged local records
- Deferred local images and Mermaid diagrams until they approach the viewport, cached rendered diagrams, and split the Viewer into cacheable dependency chunks
- Extracted the workspace tree, menus, command center, outline, URL dialog, and settings drawer into dedicated Viewer components
- Added a prominent, listing-level disclosure of all on-device and user-directed data handling for the Chrome Web Store policy effective August 1, 2026

### Fixed

- Opened only external web and email links in a new tab, while preserving heading fragments when navigating between Markdown documents
- Kept the browser's native `Cmd/Ctrl+F` find action and made command-center document and workspace-file results navigable
- Prevented the same workspace file from appearing twice in command-center search results
- Kept generated browser-test screenshots and traces out of the Firefox source-review archive

## [0.0.2] - 2026-08-01

### Added

- Five global English and five Simplified Chinese Chrome Web Store screenshots, with automated size, color, and alpha-channel validation
- Localized Chrome Web Store listing copy and permission-by-permission privacy disclosures
- Release-tag validation that prevents publishing a tag which does not match the package version
- A keyboard-first command center for recent documents, opening sources, navigation, themes, and reader settings
- Address-bar preview for absolute local `.md`, `.markdown`, and `.mdx` paths, preserving the original file URL after the user enables browser file access
- A one-click wide reading mode in the document toolbar

### Changed

- Simplified the Quire icon to a single `M` monogram and made SVG-to-PNG icon generation reproducible
- Localized the built-in welcome document, remote-reading errors, accessibility labels, and keyboard-command description
- Made package, source-reproduction, and installed-Firefox checks derive artifact names from `package.json`
- Added store-asset verification to continuous integration and release workflows
- Rebuilt the viewer around a quiet 52 px navigation rail, an on-demand workspace tree, and a lightweight floating outline
- Consolidated file, folder, and remote URL actions into one Open menu and moved reading controls into a live-preview settings drawer
- Regenerated both localized screenshot sets to reflect the reader-first interaction model

### Fixed

- Preserved complete folder names in the workspace tree and anchored the automatic-refresh indicator to the bottom of its panel
- Kept long document outlines scrollable without compressing or overflowing their heading rows
- Removed the static document-category label and the active-outline shadow from the reading surface
- Classified address-bar `file://` Markdown as local content, kept it out of the folder workspace, and preserved its original path
- Added visible loading feedback while remote Markdown documents are being fetched

## [0.0.1] - 2026-07-31

### Added

- Read-only Markdown viewer for Chrome, Edge, and Firefox
- Local files and nested folder workspaces with recent-workspace restoration
- Relative workspace images, internal Markdown links, and automatic refresh
- Remote Markdown URLs with per-origin optional permissions and conditional refresh
- Toolbar action, keyboard shortcut, and page context-menu imports
- Search, outline navigation, reading progress, themes, typography, KaTeX, Mermaid, custom CSS, and sanitized HTML
- First-run guidance, actionable error and permission states, English and Simplified Chinese interfaces
- Reproducible browser packages, automated tests, community documents, store materials, and release automation

[Unreleased]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.7...HEAD
[0.0.7]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/hengistchan/quire-markdown-reader/releases/tag/v0.0.1
