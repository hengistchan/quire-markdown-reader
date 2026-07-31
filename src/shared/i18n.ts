export type AppLocale = 'en' | 'zh-CN';

const en = {
  openFile: 'Open file', openFolder: 'Open folder', openUrl: 'Open URL', search: 'Search document', settings: 'Reader settings',
  files: 'Files', outline: 'Outline', workspace: 'Workspace', onThisPage: 'On this page', sections: 'sections',
  noFolder: 'No folder open', chooseFolder: 'Choose a folder', localOnly: 'Local-only reading', endDocument: 'End of document',
  searchPlaceholder: 'Search this document…', searchHint: 'Type a word or phrase to search the Markdown source.', noMatches: 'No matches in this document.',
  readingRoom: 'Reading room', makeItYours: 'Make it yours', appearance: 'Appearance', readingFont: 'Reading font', fontDescription: 'Choose the voice of the page', sans: 'Sans', serif: 'Serif', textSize: 'Text size', lineHeight: 'Line height', pageWidth: 'Page width',
  markdown: 'Markdown', mathematics: 'Mathematics', mathDescription: 'Render KaTeX expressions', diagrams: 'Diagrams', diagramDescription: 'Render Mermaid blocks', readingProgress: 'Reading progress', progressDescription: 'Show a fine progress line', autoRefresh: 'Auto refresh', refreshDescription: 'Watch the current document for changes', rawHtml: 'Raw HTML', htmlDescription: 'Sanitized before display', customCss: 'Custom CSS', cssNote: 'Scoped to the document. Changes are saved automatically.', language: 'Language', system: 'System', light: 'Light', dark: 'Dark',
  welcomeTitle: 'Your documents, set for reading.', welcomeBody: 'Open a Markdown file, connect a local folder, or read a document from the web. Quire never edits the source.', getStarted: 'Start reading', privateByDesign: 'Private by design', privateBody: 'Documents stay on this device. Network access is requested only for the site you choose.', chooseFileAction: 'Choose a file', connectFolderAction: 'Connect a folder', pasteUrlAction: 'Open a web URL',
  urlTitle: 'Open Markdown from the web', urlDescription: 'Quire requests access only to this website. The permission can be removed from your browser settings.', urlPlaceholder: 'https://example.com/guide.md', cancel: 'Cancel', open: 'Open',
  restoreTitle: 'Restore your workspace?', restoreBody: 'Quire remembers the folder, but your browser requires a click before access can resume.', restore: 'Restore workspace', dismiss: 'Not now',
  fileTypeError: 'Choose a Markdown file: .md, .markdown, or .mdx.', fileReadError: 'Quire could not read that file. Check its permission and try again.', folderUnsupported: 'This browser cannot open entire folders. You can still open individual Markdown files.', noMarkdown: 'No Markdown files were found in this folder.', folderReadError: 'Quire could not read that folder. Check its permission and try again.', permissionDenied: 'Access was not granted. Quire did not read anything from that location.', linkedFileMissing: 'That linked Markdown file was not found in this workspace.', invalidUrl: 'Enter a valid HTTP or HTTPS Markdown URL.', remoteReadError: 'Quire could not load that URL.', updated: 'Document refreshed', watching: 'Watching for changes', hideSidebar: 'Hide sidebar', showSidebar: 'Show sidebar', closeSettings: 'Close settings',
  recent: 'Recent', fromWeb: 'From the web', imported: 'Imported document', gettingStarted: 'Getting started', untitled: 'Untitled',
} as const;

const zh: Record<keyof typeof en, string> = {
  openFile: '打开文件', openFolder: '打开文件夹', openUrl: '打开网址', search: '搜索文档', settings: '阅读设置',
  files: '文件', outline: '大纲', workspace: '工作区', onThisPage: '当前文档', sections: '个章节',
  noFolder: '尚未打开文件夹', chooseFolder: '选择文件夹', localOnly: '仅在本地阅读', endDocument: '文档结束',
  searchPlaceholder: '搜索当前文档…', searchHint: '输入关键词以搜索 Markdown 原文。', noMatches: '当前文档中没有匹配内容。',
  readingRoom: '阅读空间', makeItYours: '按你的方式阅读', appearance: '外观', readingFont: '正文字体', fontDescription: '选择页面的阅读气质', sans: '无衬线', serif: '衬线', textSize: '字号', lineHeight: '行高', pageWidth: '页面宽度',
  markdown: 'Markdown', mathematics: '数学公式', mathDescription: '渲染 KaTeX 表达式', diagrams: '图表', diagramDescription: '渲染 Mermaid 代码块', readingProgress: '阅读进度', progressDescription: '显示顶部进度细线', autoRefresh: '自动刷新', refreshDescription: '监听当前文档的变化', rawHtml: '原始 HTML', htmlDescription: '显示前进行安全清洗', customCss: '自定义 CSS', cssNote: '仅作用于文档区域，并自动保存。', language: '语言', system: '跟随系统', light: '浅色', dark: '深色',
  welcomeTitle: '让文档回到阅读本身。', welcomeBody: '打开 Markdown 文件、连接本地文件夹，或读取网络文档。Quire 永远不会修改源文件。', getStarted: '开始阅读', privateByDesign: '隐私优先', privateBody: '文档保留在本机；只有在你选择网站时，Quire 才会请求该网站的访问权限。', chooseFileAction: '选择文件', connectFolderAction: '连接文件夹', pasteUrlAction: '打开网络文档',
  urlTitle: '打开网络 Markdown', urlDescription: 'Quire 只请求当前网站的访问权限，你可以随时在浏览器设置中移除。', urlPlaceholder: 'https://example.com/guide.md', cancel: '取消', open: '打开',
  restoreTitle: '恢复上次的工作区？', restoreBody: 'Quire 记住了该文件夹，但浏览器要求你点击后才能重新授权。', restore: '恢复工作区', dismiss: '暂不恢复',
  fileTypeError: '请选择 .md、.markdown 或 .mdx 文件。', fileReadError: 'Quire 无法读取该文件，请检查权限后重试。', folderUnsupported: '当前浏览器不能打开整个文件夹，但仍可打开单个 Markdown 文件。', noMarkdown: '这个文件夹中没有找到 Markdown 文件。', folderReadError: 'Quire 无法读取该文件夹，请检查权限后重试。', permissionDenied: '未获得访问权限，Quire 没有读取该位置的任何内容。', linkedFileMissing: '工作区中没有找到这个 Markdown 链接指向的文件。', invalidUrl: '请输入有效的 HTTP 或 HTTPS Markdown 地址。', remoteReadError: 'Quire 无法加载这个网址。', updated: '文档已刷新', watching: '正在监听变化', hideSidebar: '隐藏侧栏', showSidebar: '显示侧栏', closeSettings: '关闭设置',
  recent: '最近打开', fromWeb: '来自网络', imported: '导入的文档', gettingStarted: '开始使用', untitled: '未命名',
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
