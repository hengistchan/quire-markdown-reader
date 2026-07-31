# Quire v0.0.1 acceptance matrix

This document is the release boundary for the first public version. Every row requires automated or reproducible evidence before the tag is created.

## Reader flows

- [x] Open a local Markdown file and render supported syntax.
- [x] Open a local folder as a nested document tree.
- [x] Resolve relative images from an opened workspace.
- [x] Open relative Markdown links inside the reader.
- [x] Refresh the active local document after it changes.
- [x] Restore a previously authorized workspace after restart.
- [x] Open a remote Markdown URL through an explicit host-permission flow.
- [x] Import the active browser tab from the action, command, and context menu.

## Product experience

- [x] Ship complete extension icon sizes and store artwork.
- [x] Show first-run guidance, useful empty states, permission guidance, and actionable errors.
- [x] Support English and Simplified Chinese UI and manifest text.
- [x] Preserve responsive layout, keyboard access, reduced motion, and light/dark themes.

## Quality and release

- [x] Unit-test existing Markdown, file, settings, path, remote, and persistence behavior.
- [x] Run installed-extension E2E tests in Chromium and Firefox.
- [x] Validate manifests, archives, permissions, and Firefox source reproducibility.
- [x] Provide privacy, store listing, screenshots, changelog, issue templates, and release automation.
- [x] Create and push the public GitHub repository.
- [x] Create the annotated `v0.0.1` tag only after every preceding gate passes.
