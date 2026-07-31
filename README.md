# Folio — Open-source Markdown Reader

Folio is an open-source, read-only Markdown reader and local document workspace for modern browsers. It renders Markdown in a focused reading layout and never modifies source files.

Chrome, Edge, and Firefox are first-class build targets. Capabilities that depend on the File System Access API, such as opening an entire local folder, degrade to single-file opening in browsers that do not provide that API.

## Features

- Open a single `.md`, `.markdown`, or `.mdx` file
- Open a local folder and browse its Markdown files
- Navigate the current document from a generated outline
- GFM task lists, footnotes, definition lists, abbreviations, and callouts
- KaTeX, Mermaid, and language-aware code highlighting
- Light, dark, and system themes with typography controls
- Document search, reading progress, custom document CSS, and saved settings
- Open the current browser page from the extension action or `Cmd/Ctrl + Shift + M`

## Browser support

| Browser | Build target | Single file | Local folder |
| --- | --- | --- | --- |
| Chrome / Chromium | Manifest V3 | Yes | Yes |
| Edge | Chrome MV3 package | Yes | Yes |
| Firefox | Firefox package | Yes | When supported by the browser |

## Development

```bash
npm install
npm run dev:chrome
# or
npm run dev:firefox
```

## Build and verify

```bash
npm run compile
npm test
npm run build
```

The unpacked builds are generated under `.output/`. Create store-ready archives with `npm run zip`.

Before the first Firefox store submission, the maintainers must choose a permanent add-on ID and add it to `browser_specific_settings.gecko.id`. It is intentionally not guessed in source because changing it later breaks the extension's identity and update path.

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security defaults

Raw HTML is off by default and sanitized with DOMPurify when enabled. Mermaid runs in strict mode. All rendering libraries are bundled with the extension; no executable code is loaded from a CDN.

Please report vulnerabilities according to [SECURITY.md](SECURITY.md), not through a public issue.

## License

Folio is available under the [MIT License](LICENSE).
