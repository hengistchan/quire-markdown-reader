# Contributing to Quire

Thank you for helping make Markdown reading better across browsers.

## Before opening a change

1. Search existing issues and pull requests to avoid duplicating work.
2. For a substantial feature or a new permission, open a design issue first.
3. Keep Quire read-only unless the maintainers have accepted a proposal that changes that boundary.

## Local setup

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run dev:chrome
```

Use `npm run dev:firefox` when testing Firefox-specific behavior.

## Required checks

Run these before opening a pull request:

```bash
npm run compile
npm test
npm run build
npm run test:e2e
```

The final command builds both Chrome/Chromium and Firefox variants. If your change affects layout or interaction, test the viewer at desktop and narrow viewport widths as well.

## Project boundaries

- Treat Markdown and remote page content as untrusted input.
- Do not load executable code from a CDN.
- Keep permissions optional or narrowly scoped whenever possible.
- Preserve keyboard access, visible focus, reduced-motion support, and responsive layouts.
- Avoid browser-specific APIs without a feature check and a usable fallback.
- Add or update tests for behavior changes.

## Pull requests

Explain the user-facing problem, the chosen approach, browser coverage, and verification performed. Keep unrelated refactors out of the same pull request.

By contributing, you agree that your contributions are licensed under the MIT License.
