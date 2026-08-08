# Quire — Markdown Reader

## Short description

Read local folders, individual files, and web Markdown in Chrome—without an account, uploads, or changes to the source.

## Single purpose

Quire renders user-selected local files, folders, active-page text, and remote Markdown URLs as a focused, read-only reading workspace.

## Data handling disclosure

Quire handles only content and locations that you explicitly choose for its reading features. Local documents, reader settings, recent-item metadata, reading positions, and browser-managed file or folder handles stay on your device. When you import the current page, its title, URL, and visible text are processed locally as a temporary plain-text snapshot. When you open a remote Markdown URL, your browser sends a direct request to that selected website, so that website receives the normal network request. Quire has no developer backend, account, analytics, advertising, tracking, or sale of user data. See the linked privacy policy for retention and deletion details.

## Full description

Turn Markdown source into a document made for reading.

Quire has one clear purpose: open local or web Markdown in Chrome as a focused, read-only document workspace. It is made for project READMEs, developer documentation, knowledge bases, course notes, and long technical articles. You do not need to launch an editor just to see formatted content or upload private files to an online service.

Key features:

- Open individual .md and .markdown files
- Preview .mdx safely as ordinary Markdown; Quire displays JSX, imports, and expressions as text and never executes them
- Enter an absolute local Markdown path after enabling file-URL access and keep that path visible in the address bar
- Connect a local folder and browse a real nested document tree
- Switch quickly between the folder tree and current document outline
- Resolve relative images and Markdown links inside the workspace
- Search the current document and follow reading progress
- Continue from the last reading position and navigate back or forward between workspace documents
- Drag in a Markdown file or folder, or paste Markdown text directly into the reader
- Adjust a warm light, dark, or system theme, plus font, text size, line height, and page width
- Copy highlighted code from a floating action that appears on hover or keyboard focus
- Render task lists, footnotes, callouts, KaTeX formulas, and sanitized raw HTML
- Pan, zoom, reset, and drag theme-aware Mermaid diagrams
- Open a web Markdown URL with access limited to the website you choose
- Read the visible text of the current page as a plain-text snapshot from the toolbar, context menu, or `Alt/Option + Shift + M`

Why install Quire?

Quire separates reading Markdown from editing it. Its warm, paper-like interface stays quiet, source files remain read-only, and local documents stay on your device. If you regularly read READMEs, technical specifications, research notes, or a local knowledge base, you get clearer navigation and fewer distractions without changing how your files are organized.

Quire is open source. It has no account, analytics, ads, tracking, or developer backend. Local documents are not uploaded, and source files are never modified.

## Permission disclosure

- Active tab and scripting: import visible page text only after an explicit user action.
- Context menus: provide “Open in Quire.”
- Storage: save reader preferences, onboarding state, recent metadata, and reading positions on this device; browser-managed local file and folder handles are stored in on-device IndexedDB.
- Optional website access: fetch a user-selected remote Markdown document from that origin only.
- Local file-URL access: after you enable it in Chrome's extension details, detect and read only local .md, .markdown, or .mdx documents you open explicitly in the address bar.
