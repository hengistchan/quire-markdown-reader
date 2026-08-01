export type AppLocale = 'en' | 'zh-CN';

const en = {
  openFile: 'Open file', openFolder: 'Open folder', openUrl: 'Open URL', search: 'Search document', settings: 'Reader settings',
  files: 'Files', outline: 'Outline', workspace: 'Workspace', onThisPage: 'On this page', sections: 'sections',
  noFolder: 'No folder open', chooseFolder: 'Choose a folder', localOnly: 'Local-only reading', endDocument: 'End of document',
  searchPlaceholder: 'Search this document…', searchHint: 'Type a word or phrase to search the Markdown source.', noMatches: 'No matches in this document.',
  readingRoom: 'Reading room', makeItYours: 'Make it yours', appearance: 'Appearance', readingFont: 'Reading font', fontDescription: 'Choose the voice of the page', sans: 'Sans', serif: 'Serif', textSize: 'Text size', lineHeight: 'Line height', pageWidth: 'Page width',
  markdown: 'Markdown', mathematics: 'Mathematics', mathDescription: 'Render KaTeX expressions', diagrams: 'Diagrams', diagramDescription: 'Render Mermaid blocks', readingProgress: 'Reading progress', progressDescription: 'Show a fine progress line', autoRefresh: 'Auto refresh', refreshDescription: 'Watch the current document for changes', rawHtml: 'Raw HTML', htmlDescription: 'Sanitized before display', customCss: 'Custom CSS', cssNote: 'Scoped to the document. Changes are saved automatically.', language: 'Language', system: 'System', light: 'Light', dark: 'Dark',
  welcomeTitle: 'Your documents, set for reading.', welcomeBody: 'Open a Markdown file, connect a local folder, or read a document from the web. Quire never edits the source.', getStarted: 'Start reading', privateByDesign: 'Private by design', privateBody: 'Documents stay on this device. Network access is requested only for the site you choose.', chooseFileAction: 'Choose a file', connectFolderAction: 'Connect a folder', pasteUrlAction: 'Open a web URL',
  urlTitle: 'Open Markdown from the web', urlDescription: 'Quire requests access only to this website. The permission can be removed from your browser settings.', urlPlaceholder: 'https://example.com/guide.md', loadingRemote: 'Loading Markdown…', cancel: 'Cancel', retry: 'Retry', open: 'Open',
  restoreTitle: 'Restore your workspace?', restoreBody: 'Quire remembers the folder, but your browser requires a click before access can resume.', restore: 'Restore workspace', refreshWorkspace: 'Refresh workspace', workspaceRefreshed: 'Workspace refreshed', scanningWorkspace: 'Scanning workspace…', workspaceScanLimit: 'Workspace scanning stopped at its safety limit. Choose a smaller folder.', dismiss: 'Not now',
  fileTypeError: 'Choose a Markdown file: .md, .markdown, or .mdx.', fileReadError: 'Quire could not read that file. Check its permission and try again.', folderUnsupported: 'This browser cannot open entire folders. You can still open individual Markdown files.', noMarkdown: 'No Markdown files were found in this folder.', folderReadError: 'Quire could not read that folder. Check its permission and try again.', permissionDenied: 'Access was not granted. Quire did not read anything from that location.', linkedFileMissing: 'That linked Markdown file was not found in this workspace.', invalidUrl: 'Enter a valid HTTP or HTTPS Markdown URL.', remoteReadError: 'Quire could not load that URL. Check your connection and try again.', remoteTimeout: 'The remote Markdown request timed out.', remoteServerError: 'The server returned HTTP', remoteTooLarge: 'The Markdown file is larger than 5 MB.', updated: 'Document refreshed', watching: 'Watching for changes', hideSidebar: 'Hide sidebar', showSidebar: 'Show sidebar', closeSettings: 'Close settings', close: 'Close', dismissNotice: 'Dismiss notification', documentNavigation: 'Document navigation', resourceUnavailable: 'resource unavailable', untitledSection: 'Untitled section',
  openContent: 'Open content', commandCenter: 'Command center', commandPlaceholder: 'Type a command, filename, or URL…', commands: 'Commands', recentlyOpened: 'Recently opened', workspaceFiles: 'Workspace files', line: 'Line', moreActions: 'More actions', filterFiles: 'Filter files…', toggleWorkspace: 'Toggle file workspace', toggleOutline: 'Toggle document outline', enableWideView: 'Use wider reading width', disableWideView: 'Use standard reading width', quietMode: 'Enter quiet reading mode', useLightTheme: 'Use light theme', useDarkTheme: 'Use dark theme', minuteRead: 'min read', readingAids: 'Reading aids', floatingOutline: 'Floating outline', outlineDescription: 'Keep the document outline within reach', markdownExtensions: 'Markdown extensions', advanced: 'Advanced', settingsLive: 'Changes apply to the current document immediately.', resetSettings: 'Restore defaults', savedLocally: 'Saved on this device', noCommandResults: 'No matching commands or documents.', currentDocument: 'Current document', closeCommand: 'Close command center',
  recent: 'Recent', fromWeb: 'From the web', localFile: 'Local file', imported: 'Imported document', plainTextSnapshot: 'Page text snapshot', gettingStarted: 'Getting started', untitled: 'Untitled',
  resumeReading: 'Continue where you left off?', continueReading: 'Continue reading', startFromTop: 'Start from top', dropToOpen: 'Drop Markdown or a folder to open', pastedDocument: 'Pasted Markdown',
  welcomeDocumentTitle: 'Welcome to Quire',
  welcomeDocument: `# Welcome to Quire

Quire turns Markdown into a focused reading space. Open a file, connect a folder, or read a document from the web.

::: note
**Built for reading.** Your documents stay on your device, and Quire never modifies the source.
:::

## A quieter workspace

Switch between a real folder tree and the current document outline. Everything else gets out of the way.

- [x] GitHub-flavoured Markdown
- [x] Footnotes, definitions, and callouts
- [x] Syntax highlighting
- [x] KaTeX and Mermaid diagrams
- [x] Relative images and document links

## Rich technical notes

Inline maths such as $E = mc^2$ stays crisp, while code keeps its language-aware highlighting:

\`\`\`ts
type ReadingState = {
  document: string;
  position: number;
};
\`\`\`

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B[Sanitize]
  B --> C[Read]
\`\`\`

## Start here

Use **Open file** for one document, **Open folder** for a local workspace, or **Open URL** for remote Markdown.

To preview an absolute path from the address bar, enable **Allow access to file URLs** in Quire's extension details, then open a URL such as \`file:///Users/name/docs/README.md\`.
`,
} as const;

const zh: Record<keyof typeof en, string> = {
  openFile: '打开文件', openFolder: '打开文件夹', openUrl: '打开网址', search: '搜索文档', settings: '阅读设置',
  files: '文件', outline: '大纲', workspace: '工作区', onThisPage: '当前文档', sections: '个章节',
  noFolder: '尚未打开文件夹', chooseFolder: '选择文件夹', localOnly: '仅在本地阅读', endDocument: '文档结束',
  searchPlaceholder: '搜索当前文档…', searchHint: '输入关键词以搜索 Markdown 原文。', noMatches: '当前文档中没有匹配内容。',
  readingRoom: '阅读空间', makeItYours: '按你的方式阅读', appearance: '外观', readingFont: '正文字体', fontDescription: '选择页面的阅读气质', sans: '无衬线', serif: '衬线', textSize: '字号', lineHeight: '行高', pageWidth: '页面宽度',
  markdown: 'Markdown', mathematics: '数学公式', mathDescription: '渲染 KaTeX 表达式', diagrams: '图表', diagramDescription: '渲染 Mermaid 代码块', readingProgress: '阅读进度', progressDescription: '显示顶部进度细线', autoRefresh: '自动刷新', refreshDescription: '监听当前文档的变化', rawHtml: '原始 HTML', htmlDescription: '显示前进行安全清洗', customCss: '自定义 CSS', cssNote: '仅作用于文档区域，并自动保存。', language: '语言', system: '跟随系统', light: '浅色', dark: '深色',
  welcomeTitle: '让文档回到阅读本身。', welcomeBody: '打开 Markdown 文件、连接本地文件夹，或读取网络文档。Quire 永远不会修改源文件。', getStarted: '开始阅读', privateByDesign: '隐私优先', privateBody: '文档保留在本机；只有在你选择网站时，Quire 才会请求该网站的访问权限。', chooseFileAction: '选择文件', connectFolderAction: '连接文件夹', pasteUrlAction: '打开网络文档',
  urlTitle: '打开网络 Markdown', urlDescription: 'Quire 只请求当前网站的访问权限，你可以随时在浏览器设置中移除。', urlPlaceholder: 'https://example.com/guide.md', loadingRemote: '正在加载 Markdown…', cancel: '取消', retry: '重试', open: '打开',
  restoreTitle: '恢复上次的工作区？', restoreBody: 'Quire 记住了该文件夹，但浏览器要求你点击后才能重新授权。', restore: '恢复工作区', refreshWorkspace: '刷新工作区', workspaceRefreshed: '工作区已刷新', scanningWorkspace: '正在扫描工作区…', workspaceScanLimit: '工作区扫描已达到安全上限，请选择更小的文件夹。', dismiss: '暂不恢复',
  fileTypeError: '请选择 .md、.markdown 或 .mdx 文件。', fileReadError: 'Quire 无法读取该文件，请检查权限后重试。', folderUnsupported: '当前浏览器不能打开整个文件夹，但仍可打开单个 Markdown 文件。', noMarkdown: '这个文件夹中没有找到 Markdown 文件。', folderReadError: 'Quire 无法读取该文件夹，请检查权限后重试。', permissionDenied: '未获得访问权限，Quire 没有读取该位置的任何内容。', linkedFileMissing: '工作区中没有找到这个 Markdown 链接指向的文件。', invalidUrl: '请输入有效的 HTTP 或 HTTPS Markdown 地址。', remoteReadError: 'Quire 无法加载这个网址，请检查网络后重试。', remoteTimeout: '加载网络 Markdown 超时。', remoteServerError: '服务器返回了 HTTP', remoteTooLarge: 'Markdown 文件超过 5 MB。', updated: '文档已刷新', watching: '正在监听变化', hideSidebar: '隐藏侧栏', showSidebar: '显示侧栏', closeSettings: '关闭设置', close: '关闭', dismissNotice: '关闭通知', documentNavigation: '文档导航', resourceUnavailable: '资源不可用', untitledSection: '未命名章节',
  openContent: '打开内容', commandCenter: '命令中心', commandPlaceholder: '输入命令、文件名或 URL…', commands: '操作', recentlyOpened: '最近打开', workspaceFiles: '工作区文件', line: '第', moreActions: '更多操作', filterFiles: '筛选文件…', toggleWorkspace: '切换文件工作区', toggleOutline: '切换文档大纲', enableWideView: '开启较宽展示', disableWideView: '恢复标准宽度', quietMode: '进入安静阅读模式', useLightTheme: '切换浅色主题', useDarkTheme: '切换深色主题', minuteRead: '分钟阅读', readingAids: '阅读辅助', floatingOutline: '右侧悬浮大纲', outlineDescription: '在阅读时随时查看当前文档结构', markdownExtensions: 'Markdown 扩展', advanced: '高级', settingsLive: '修改后立即应用到当前文档。', resetSettings: '恢复默认设置', savedLocally: '设置保存在此设备', noCommandResults: '没有匹配的命令或文档。', currentDocument: '当前文档', closeCommand: '关闭命令中心',
  recent: '最近打开', fromWeb: '来自网络', localFile: '本地文件', imported: '导入的文档', plainTextSnapshot: '网页文本快照', gettingStarted: '开始使用', untitled: '未命名',
  resumeReading: '继续上次阅读位置？', continueReading: '继续阅读', startFromTop: '从头开始', dropToOpen: '拖入 Markdown 或文件夹以打开', pastedDocument: '粘贴的 Markdown',
  welcomeDocumentTitle: '欢迎使用 Quire',
  welcomeDocument: `# 欢迎使用 Quire

Quire 将 Markdown 变成专注的阅读空间。打开文件、连接文件夹，或读取网络文档。

::: note
**为阅读而生。** 文档保留在你的设备上，Quire 永远不会修改源文件。
:::

## 更安静的工作区

在真实文件树和当前文档大纲之间切换，其余界面保持克制。

- [x] GitHub 风格 Markdown
- [x] 脚注、定义与提示块
- [x] 语法高亮
- [x] KaTeX 公式与 Mermaid 图表
- [x] 相对路径图片与文档链接

## 丰富的技术笔记

行内公式 $E = mc^2$ 保持清晰，代码则保留对应语言的语法高亮：

\`\`\`ts
type ReadingState = {
  document: string;
  position: number;
};
\`\`\`

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B[安全清洗]
  B --> C[阅读]
\`\`\`

## 从这里开始

使用 **打开文件** 阅读单篇文档，使用 **打开文件夹** 连接本地工作区，或使用 **打开网址** 读取网络 Markdown。

如果要从地址栏预览绝对路径，请先在 Quire 扩展详情页开启 **允许访问文件网址**，再打开类似 \`file:///Users/name/docs/README.md\` 的地址。
`,
};

export type TranslationKey = keyof typeof en;

export function resolveLocale(preference: 'system' | AppLocale, browserLocale = navigator.language): AppLocale {
  if (preference !== 'system') return preference;
  return browserLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function createTranslator(locale: AppLocale): (key: TranslationKey) => string {
  const messages = locale === 'zh-CN' ? zh : en;
  return (key) => messages[key];
}
