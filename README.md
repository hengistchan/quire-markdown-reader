# Quire — Open-source Markdown Reader

Quire is an open-source, read-only Markdown reader and local document workspace for Chrome, Edge, and Firefox. It turns local or web Markdown into a focused reading space and never modifies source files.

## Features

- Open `.md` and `.markdown` files with automatic refresh where file handles are supported
- Preview `.mdx` safely as ordinary Markdown; JSX, imports, and expressions are shown as text and never executed
- Preview a local Markdown absolute path entered as a `file://` URL without changing the address bar
- Connect a local folder, browse its nested tree, and restore it after a browser restart
- Resolve workspace-relative images and navigate relative Markdown links inside the reader
- Open a remote Markdown URL after granting access to that website only
- Read the active page's visible text as a plain-text snapshot from the toolbar action, page context menu, or `Alt/Option + Shift + M`
- Render task lists, footnotes, definitions, abbreviations, callouts, KaTeX, Mermaid, and highlighted code
- Search and navigate by document outline
- Choose light, dark, or system appearance; typography, reading width, and custom document CSS
- Use the interface in English or Simplified Chinese

Local folder access uses the File System Access API. Browsers without that API keep the single-file workflow available.

## Browser support

| Browser | Package | Single file | Address-bar path | Local folder | Remote URL |
| --- | --- | --- | --- | --- | --- |
| Chrome / Chromium | Manifest V3 | Yes | Yes, after enabling file-URL access | Yes | Yes, per-site permission |
| Edge | Chrome MV3 | Yes | Yes, after enabling file-URL access | Yes | Yes, per-site permission |
| Firefox | Manifest V2 | Yes | Browser-dependent | Browser-dependent | Yes, per-site permission |

For address-bar preview in Chrome or Edge, open Quire's extension details, enable **Allow access to file URLs**, then enter an absolute URL such as `file:///Users/name/docs/README.md`. Quire renders the document while keeping that local path in the address bar. It checks local pages for `.md`, `.markdown`, or `.mdx` only; other local file types are ignored.

## Install from source

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm run build
```

Load `.output/chrome-mv3/` as an unpacked extension in a Chromium browser. For Firefox, load `.output/firefox-mv2/manifest.json` as a temporary add-on. Store-ready archives are created by `npm run zip`.

For development:

```bash
npm run dev:chrome
# or
npm run dev:firefox
```

## Verify

```bash
npm run compile
npm test
npm run build
npm run zip
npm run package:verify
npm run source:verify
npm run store:verify
npm run test:e2e
```

The installed-extension E2E suite covers Chromium and Firefox. See the [v0.0.3 acceptance matrix](docs/acceptance-v0.0.3.md) for the current release boundary; earlier matrices remain as historical evidence.

## Permissions and privacy

Quire stores reader settings, recent-document metadata, and a browser-managed local folder handle on the device. It has no account, analytics, advertising, or developer-operated backend. Website access is optional and requested for one origin when the user opens a remote document. Active-page content is read only after the user invokes an explicit import action. Local-file URL access is disabled by Chrome until the user enables it in Quire's extension details.

See [PRIVACY.md](PRIVACY.md) for the complete data and permission disclosure and [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Firefox reviewers can reproduce the package using [SOURCE_CODE_REVIEW.md](SOURCE_CODE_REVIEW.md).

## License

Quire is available under the [MIT License](LICENSE).
