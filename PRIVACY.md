# Quire privacy policy

Effective date: 2026-07-31

Quire is a read-only Markdown reader. It does not operate a backend service and does not collect, sell, or share personal data.

## Data Quire handles

- **Local documents:** Files and folders selected by the user are read and rendered on the user's device. Quire never uploads them or modifies their source.
- **Active-page content:** When the user explicitly clicks the Quire toolbar action, invokes its shortcut, or chooses its page context-menu item, Quire reads that tab's visible text and opens it in the local reader. It does not perform background browsing-history collection.
- **Remote documents:** When the user enters a web address, Quire requests access to that website and fetches the selected Markdown document directly from it. The selected server receives the ordinary network request. Quire does not proxy the request through a developer server.
- **On-device preferences:** Reader settings, onboarding state, recent-document titles and URLs, and a browser-managed reference to the most recent folder are stored in browser storage on the user's device.

Quire has no accounts, analytics, telemetry, advertising, tracking pixels, or developer-operated data store. No human associated with Quire can access a user's documents through the extension.

## Permissions

- `activeTab` and `scripting`: read the visible text of the current tab only after the user invokes an import action.
- `contextMenus`: provide the explicit “Open in Quire” page action.
- `storage`: keep reader preferences, recent-document metadata, onboarding state, and the one-time page import on the device.
- Optional `http://`, `https://`, and `file://` host access: access is requested only when the user chooses a matching document or browser feature. Remote web access is scoped to the selected origin.

## Retention and deletion

Settings and recent metadata remain in browser storage until the user clears extension data or uninstalls Quire. Folder access can be revoked through browser site or extension settings. Remote-origin permissions can be removed through the browser's extension permissions page.

## Limited Use

Quire's use of information received through browser APIs is limited to providing its user-facing Markdown reading features. Quire does not transfer that information except as necessary to fetch a user-selected remote document, comply with law, or protect security; it does not use data for advertising, credit decisions, or unrelated purposes. This use complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes and contact

Material changes will be documented in this file and the project changelog. Privacy questions can be opened as a public repository discussion when they contain no sensitive information; suspected vulnerabilities must follow [SECURITY.md](SECURITY.md).
