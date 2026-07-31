# Quire — Markdown Reader

## Short description

A calm, private reading workspace for local and web Markdown documents.

## Single purpose

Quire renders user-selected local files, folders, active-page text, and remote Markdown URLs as a focused, read-only reading workspace.

## Full description

Read Markdown without turning it into another editor.

Quire opens individual Markdown files or a local folder with a nested document tree. Images and Markdown links resolve inside the connected workspace, and supported files refresh when they change. You can also open a web Markdown URL after granting access to that website only.

The reader includes document search, outline navigation, reading progress, light and dark themes, typography controls, syntax highlighting, task lists, footnotes, callouts, KaTeX, Mermaid, sanitized HTML, and custom document CSS. Use Quire in English or Simplified Chinese.

Use the toolbar button, `Alt/Option + Shift + M`, or the page context menu to bring the current page's visible text into the reader.

Privacy is part of the product boundary: Quire has no account, analytics, ads, tracking, or developer backend. Local documents stay on the device, and Quire never edits source files.

## Permission disclosure

- Active tab and scripting: import visible page text only after an explicit user action.
- Context menus: provide “Open in Quire.”
- Storage: save local reader preferences, onboarding state, recent metadata, and workspace restoration data.
- Optional website access: fetch a user-selected remote Markdown document from that origin only.
