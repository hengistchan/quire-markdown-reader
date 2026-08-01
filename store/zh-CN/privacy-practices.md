# Chrome Web Store 隐私权表单

以下内容与 Quire 当前代码、商店说明和隐私政策一致，可直接粘贴到 Chrome Web Store 开发者信息中心。

## 单一用途说明

Quire 的单一用途是把用户明确选择的 Markdown 内容呈现为专注、只读的浏览器阅读工作区。内容来源包括用户选择的本地 .md、.markdown 或 .mdx 文件及文件夹、用户在地址栏明确打开的本地 Markdown 绝对路径、用户输入的远程 Markdown 网址，以及用户通过工具栏、快捷键或右键菜单主动导入的当前页面可见文本。扩展仅为阅读目的在本机解析和渲染内容，并提供文件树、大纲、搜索、排版、代码高亮、KaTeX 和 Mermaid 等直接相关功能。Quire 不编辑源文件，不在后台读取浏览历史，也不提供与 Markdown 阅读无关的功能。

## 需请求 activeTab 的理由

activeTab 仅在用户明确点击 Quire 工具栏按钮、执行 Alt/Option + Shift + M 快捷键或选择“使用 Quire 打开”右键菜单时，临时授权访问当时的活动标签页。Quire 使用该临时访问读取页面标题、网址和可见文本，并在本机阅读器中显示；不会持续访问其他标签页，不会在后台收集浏览记录，用户离开或关闭该页面后临时访问即失效。

## 需请求 contextMenus 的理由

contextMenus 用于在网页的右键菜单中提供“使用 Quire 打开”这一明确的用户操作入口。只有用户主动选择该菜单项后，Quire 才会导入当前页面的可见文本并打开只读 Markdown 阅读器。该权限不用于监控右键操作、修改网页或创建与 Markdown 阅读无关的菜单项。

## 需请求 scripting 的理由

scripting 用于在用户通过工具栏、快捷键或右键菜单明确发起导入后，对当前活动标签页执行一次 chrome.scripting.executeScript。脚本只从页面主框架返回 document.title、location.href 和 document.body.innerText，以便在本机阅读器中渲染可见内容；它不修改页面 DOM，不注入持久脚本，不访问其他标签页，也不在后台运行。

## 需请求 storage 的理由

storage 用于在用户设备上的 chrome.storage.local 中保存阅读设置、语言和主题、首次使用状态，以及最多六条最近文档的标题及用户选择的网址。Quire 不使用 storage 保存长期文档、上传或同步内容，也不向开发者或第三方传输这些数据；用户可通过清除扩展数据或卸载扩展删除它们。网页或本地地址导入使用浏览器本机 IndexedDB 中带随机 ID 的一次性交接，不依赖 storage 权限；对应阅读器读取后立即删除，未读取交接在十分钟后过期，并在下次扩展启动或交接清理时移除。

## 需请求 file:///* 的理由

file:///* 用于识别用户在浏览器地址栏中明确打开的本地 .md、.markdown 或 .mdx 文档，并把文档文本送入同一标签页中的 Quire 只读阅读器。Chrome 默认禁止该访问，只有用户在 Quire 扩展详情页主动开启“允许访问文件网址”后功能才会生效。脚本先检查地址后缀；对于非 Markdown 的本地文件会立即退出，不读取其页面内容。内容只在本机处理，不上传、不修改源文件，读取后供阅读器使用的临时副本会立即从扩展存储中删除。

## 可选网站主机权限说明

可选的 http://*/* 和 https://*/* 主机权限仅用于读取用户主动输入的远程 Markdown 网址。Quire 会在运行时只请求该网址所属来源的权限，并仅获取用户选择的文档，不会预先获得所有网站访问权，也不会在后台抓取网页。通过文件选择器打开本地 Markdown 不依赖这些权限。

## 远程代码

选择：**否，我没有使用远程代码。**

说明：Quire 的 JavaScript、React、Markdown 渲染器、KaTeX、Mermaid 和样式均随扩展包提供。远程 Markdown 仅作为用户选择的数据获取并经过安全清洗，不会作为代码执行，也不会加载远程脚本、WASM 或 `eval` 内容。

## 用户数据披露

建议勾选：

- **网站内容**：用户主动导入的当前页面可见文本，以及用户选择的远程 Markdown 内容。
- **网络历史记录**：仅处理用户主动导入的当前页面网址，以及用户主动输入并保存在最近记录中的远程 Markdown 网址；不读取 Chrome 历史记录，也不进行后台浏览跟踪。

不要勾选：个人身份信息、健康信息、财务和付款信息、身份验证信息、个人通讯、位置、用户活动。

上述网站内容和网址仅为提供 Markdown 阅读功能在本机处理，不发送给开发者，不出售，不用于广告、信用评估或任何与单一用途无关的目的。获取远程 Markdown 时，用户选择的目标网站会收到正常的直接网络请求。

## 数据使用认证

以下各项均应确认：

- 不向第三方出售用户数据。
- 不将用户数据用于或转移至与 Quire 单一用途无关的目的。
- 不将用户数据用于或转移至信用评估或贷款目的。
- 对浏览器 API 所获信息的使用遵守 Chrome Web Store 用户数据政策及 Limited Use 要求。

## 隐私权政策网址

`https://github.com/hengistchan/quire-markdown-reader/blob/main/PRIVACY.md`

提交前应确认该网址无需登录即可公开访问，并且对应已发布版本的实际行为。

## 官方参考

- [Chrome Web Store 隐私权字段](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/)
- [Chrome Web Store 开发者计划政策](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [activeTab 权限](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [声明权限](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [用户数据常见问题](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/)
