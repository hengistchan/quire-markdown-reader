# Changelog

All notable changes to Quire are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Replaced the global imported-document storage key with isolated, single-use document handoffs that expire after ten minutes
- Added platform-correct shortcut labels and implemented the displayed open-file, open-folder, and open-URL keyboard actions
- Bounded remote Markdown downloads with streamed byte limits, a 20-second timeout, active cancellation, retry actions, offline pausing, and exponential refresh backoff
- Added cancellable workspace scans with dependency/build-directory ignores, depth and item limits, plus an explicit workspace refresh action

### Fixed

- Opened only external web and email links in a new tab, while preserving heading fragments when navigating between Markdown documents
- Kept the browser's native `Cmd/Ctrl+F` find action and made command-center document and workspace-file results navigable

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

[Unreleased]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/hengistchan/quire-markdown-reader/releases/tag/v0.0.1
