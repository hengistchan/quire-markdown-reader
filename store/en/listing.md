# Quire — Markdown Reader

## Short description

Read local folders, individual files, and web Markdown in Chrome—without an account, uploads, or changes to the source.

## Single purpose

Quire renders user-selected local files, folders, active-page text, and remote Markdown URLs as a focused, read-only reading workspace.

## Full description

Turn Markdown source into a document made for reading.

Quire has one clear purpose: open local or web Markdown in Chrome as a focused, read-only document workspace. It is made for project READMEs, developer documentation, knowledge bases, course notes, and long technical articles. You do not need to launch an editor just to see formatted content or upload private files to an online service.

Key features:

- Open individual .md, .markdown, and .mdx files
- Enter an absolute local Markdown path after enabling file-URL access and keep that path visible in the address bar
- Connect a local folder and browse a real nested document tree
- Switch quickly between the folder tree and current document outline
- Resolve relative images and Markdown links inside the workspace
- Search the current document and follow reading progress
- Adjust light or dark theme, font, text size, line height, and page width
- Render highlighted code, task lists, footnotes, callouts, KaTeX formulas, and Mermaid diagrams
- Open a web Markdown URL with access limited to the website you choose
- Import the visible text of the current page from the toolbar, context menu, or `Alt/Option + Shift + M`

Why install Quire?

Quire separates reading Markdown from editing it. The interface stays quiet, source files remain read-only, and local documents stay on your device. If you regularly read READMEs, technical specifications, research notes, or a local knowledge base, you get clearer navigation and fewer distractions without changing how your files are organized.

Quire is open source. It has no account, analytics, ads, tracking, or developer backend. Local documents are not uploaded, and source files are never modified.

## Permission disclosure

- Active tab and scripting: import visible page text only after an explicit user action.
- Context menus: provide “Open in Quire.”
- Storage: save reader preferences, onboarding state, recent metadata, and the one-time active-page import consumed by the reader.
- Optional website access: fetch a user-selected remote Markdown document from that origin only.
- Local file-URL access: after you enable it in Chrome's extension details, detect and read only local .md, .markdown, or .mdx documents you open explicitly in the address bar.
