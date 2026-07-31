# Quire privacy policy

Effective date: 2026-08-01

Quire is a read-only Markdown reader. It does not operate a backend service and does not send user data to the developer, sell it, or share it for advertising or unrelated purposes. Quire processes user-selected documents, website content, and URLs only to provide its reading features, including when that processing remains entirely on the user's device.

## Data Quire handles

- **Local documents:** Files and folders selected by the user are read and rendered on the user's device. If the user enables file-URL access in browser extension settings, Quire also reads a local `.md`, `.markdown`, or `.mdx` document opened explicitly through a `file://` address. Quire ignores other local file types, never uploads local documents, and never modifies their source.
- **Active-page content and URL:** When the user explicitly clicks the Quire toolbar action, invokes its shortcut, or chooses its page context-menu item, Quire reads that tab's title, URL, and visible text and opens them in the local reader. It does not use the Chrome history API or perform background browsing-history collection.
- **Remote documents:** When the user enters a web address, Quire requests access to that website and fetches the selected Markdown document directly from it. The selected server receives the ordinary network request. Quire does not proxy the request through a developer server.
- **On-device preferences:** Reader settings, onboarding state, up to six recent-document titles and URLs, and a browser-managed reference to the most recent folder are stored on the user's device. A document imported from the active page is placed briefly in extension-local storage and removed as soon as the reader loads it.

Quire has no accounts, analytics, telemetry, advertising, tracking pixels, or developer-operated data store. No human associated with Quire can access a user's documents through the extension.

## Permissions

- `activeTab` and `scripting`: read the visible text of the current tab only after the user invokes an import action.
- `contextMenus`: provide the explicit “Open in Quire” page action.
- `storage`: keep reader preferences, recent-document metadata, onboarding state, and the one-time page import on the device. Imported page content is removed from extension storage after the reader loads it.
- Optional `http://` and `https://` host access: fetch a user-selected remote Markdown document after access is granted for that origin only.
- `file:///*` content-script access: detect a `.md`, `.markdown`, or `.mdx` document the user explicitly opens through an absolute local address and transfer its text to the Quire reader in the same tab. Chrome keeps this access disabled until the user manually enables **Allow access to file URLs** in Quire's extension details. The script returns without reading page content for every other local file type.

## Retention and deletion

Settings and recent metadata remain in browser storage until the user clears extension data or uninstalls Quire. Temporary active-page and local-address imports are removed after they are opened. Folder and file-URL access can be revoked through browser extension settings. Remote-origin permissions can be removed through the browser's extension permissions page.

## Limited Use

Quire's use of information received through browser APIs is limited to providing its user-facing Markdown reading features. Quire does not transfer that information except as necessary to fetch a user-selected remote document, comply with law, or protect security; it does not use data for advertising, credit decisions, or unrelated purposes. This use complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes and contact

Material changes will be documented in this file and the project changelog. Privacy questions can be opened as a public repository discussion when they contain no sensitive information; suspected vulnerabilities must follow [SECURITY.md](SECURITY.md).
