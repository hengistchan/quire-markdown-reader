# Changelog

All notable changes to Quire are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.0.2] - 2026-07-31

### Added

- Five global English and five Simplified Chinese Chrome Web Store screenshots, with automated size, color, and alpha-channel validation
- Localized Chrome Web Store listing copy and permission-by-permission privacy disclosures
- Release-tag validation that prevents publishing a tag which does not match the package version
- A keyboard-first command center for recent documents, opening sources, navigation, themes, and reader settings

### Changed

- Simplified the Quire icon to a single `M` monogram and made SVG-to-PNG icon generation reproducible
- Localized the built-in welcome document, remote-reading errors, accessibility labels, and keyboard-command description
- Made package, source-reproduction, and installed-Firefox checks derive artifact names from `package.json`
- Added store-asset verification to continuous integration and release workflows
- Rebuilt the viewer around a quiet 52 px navigation rail, an on-demand workspace tree, and a lightweight floating outline
- Consolidated file, folder, and remote URL actions into one Open menu and moved reading controls into a live-preview settings drawer
- Regenerated both localized screenshot sets to reflect the reader-first interaction model

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

[0.0.2]: https://github.com/hengistchan/quire-markdown-reader/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/hengistchan/quire-markdown-reader/releases/tag/v0.0.1
