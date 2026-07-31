# Source code review

Quire uses no generated source files and requires no private packages or environment variables to build.

## Requirements

- Node.js 22 or newer
- npm

## Reproduce the Firefox package

From the root of the source archive:

```bash
npm ci
npm run compile
npm test
npm run build:firefox
```

The unpacked result is written to `.output/firefox-mv2/`. Running `npm run zip:firefox` also creates the installable Firefox archive.

All KaTeX, Mermaid, syntax-highlighting, and Markdown rendering code is bundled locally. The build does not download or inject runtime code from a CDN.
