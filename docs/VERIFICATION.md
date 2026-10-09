# 验证记录

[返回中文项目说明](../README.zh-CN.md) · [开发指南](DEVELOPMENT.md)

验证环境：macOS、Node.js 20、Tauri 2。以下记录汇总独立提取及后续功能修改时执行的检查，不是每次提交自动更新的测试报告，不代表所有功能或平台已覆盖。

## 已验证

- 从锁文件干净安装前端依赖，不依赖原项目的 `node_modules`。
- TypeScript 检查、前端生产构建和 macOS 原生 `.app` 调试构建通过。
- 编辑格式的 732 项组合与移除检查，包括部分选择、互斥装饰、引用限制和表格往返转换；浏览器回归页也通过 732 项。
- 编辑交互回归 35 项、任务列表布局检查 30 项。
- 代码高亮、图片文件筛选、删除笔记本、回收站时间和恢复刷新测试。
- 独立模块边界、原生命令注册、应用标识、端口和数据目录隔离检查。
- 原生文件操作测试覆盖笔记和笔记本创建、重命名、移动、保存、历史版本、删除、恢复、彻底删除，以及本地、数据 URL 和 HTTP 图片导入。
- 路径检查覆盖目录穿越、无效回收站 ID 和符号链接；原生测试使用临时目录。
- 隔离界面测试页检查编辑器、常规设置、回收站时间显示、恢复后文档树即时刷新。

## 可靠性增补

- 原生回归新增：冲突拒绝、快照失败不覆盖、原子写入、包含图片/历史/回收站的备份恢复、校验损坏与越界路径拒绝、图片导入导出、正文搜索，以及退出等待全部窗口并拒绝过期确认。
- 前端回归新增：连续输入期间串行保存最新草稿、失败保留草稿、恢复缓存、外部更新、冲突阻止覆盖、导航与关闭标签失败保护。
- 浏览器检查新增六组编辑/阅读一致性内容：嵌套行内格式、引用、高亮块、列表/任务、代码块、表格；验证阅读态正文和单元格均拒绝修改。

## 验证边界

- 新增 PDF 原生回归：独立测试窗口生成 9 页 A4 文件，检查中文、格式组合、表格、代码高亮、图片、公式及长文末尾；测试窗口带 32 MB / 40 秒保护。运行 `cargo run --example pdf_smoke -- /tmp/一个尚不存在的测试目录/result.pdf` 前，需要启动独立项目的开发服务。
- 新增工作区名称/Logo 持久化、独立重置、非法输入、容量限制与写入失败检查；首次初始化测试覆盖九篇完整内容、图片附件、顺序和不覆盖用户修改。

- macOS 原生开发程序已启动，原生文件操作由 Rust 测试验证。当时因桌面自动操作权限限制，界面操作检查使用隔离浏览器测试页，不能替代完整原生人工验收。
- 测试构建为未签名应用；未验证开发者签名、公证和公开分发安装流程。
- 未验证 Windows、Linux，也未进行独立安全审计。
- 开源前仍应按实际发布平台复核第三方许可证、品牌素材及发布配置。

## Windows 兼容性修复

- 增加自动合并的 Windows 配置，使用系统标题栏和 NSIS 安装包。
- 图片权限范围与实际应用数据目录一致；图片路径支持盘符、UNC 和 file URL。
- 文件夹操作支持 Windows Explorer；系统托盘退出进入保存流程，关闭消息只发给目标窗口。
- Windows 名称校验拒绝保留设备名称、非法字符、尾部空格和句点。
- macOS 专属 PDF 导出在 Windows 中禁用并说明，避免选择保存路径后才失败。
- 新增平台路径、名称和能力测试，以及 Windows GitHub Actions 测试/打包配置。
- 当前验证环境仍为 macOS。Windows 专属测试、MSVC 构建、NSIS 安装和 WebView2 原生交互尚未在 Windows 执行；不得将新增工作流视为已经通过。

## 笔记列表与后续修复

- 前端回归脚本与生产构建通过；新增笔记排序检查覆盖时间、名称、缺失时间及排序偏好。
- macOS 上 19 项 Rust 原生单元测试通过；不包含仅在 Windows 编译执行的测试。
- 隔离浏览器页面检查了名称升序／降序、刷新后的排序偏好，以及创建时间与更新时间按本地时区显示到秒。
- 上述结果来自相应代码修改时的检查；文档和模板格式检查不等同于完整应用或目标平台验收。

## 鼠标定位与选择（2026-10-08）

- 隔离测试页新增 118 项鼠标检查，覆盖正文、标题、有序/无序列表、居中/右对齐、自动换行、行旁空白、双击选词和正反向跨行拖选。
- Chromium 和 macOS 独立 WKWebView 检查通过；WebKit 检查包括宽窗口/小字号、窄窗口/大字号，以及源码模式。使用合成鼠标事件验证坐标和选区，另在浏览器中通过真实鼠标拖动复核行旁空白的跨行选择。
- 项目回归脚本、生产构建、732 项格式检查和 35 项编辑交互检查通过。
- 原生应用窗口尚未进行人工鼠标验收；上述 WKWebView 测试使用内存文档，不访问用户笔记。

## 内存与后台开销优化（2026-10-09）

- 关闭笔记标签后清理已保存正文缓存，保留打开中的笔记、未保存草稿、保存队列和错误/冲突内容。模拟 200 篇缓存笔记的回归中，清理后保留 2 篇打开中的笔记及 1 篇草稿；覆盖重新读取、保存中关闭和过期读取保护。
- 后台刷新由两次笔记库扫描减少为一次；内容未变时复用原对象，避免文档树和笔记列表无意义刷新。窗口隐藏时暂停轮询，恢复可见或获得焦点时检查。
- 底部时钟独立更新，避免每秒重新渲染整个编辑视图。表格共用语法配置，同时保留每个单元格独立的文档、选区和撤销历史。
- 公式渲染器按需加载。生产主脚本由 1,541.54 kB 减至 1,279.69 kB（约 17%），另有按需加载的 260.72 kB 公式模块；这不是整个安装包或实际内存下降比例。
- 清理不再使用的全库导出实现、重复统计接口、未引用的窗口 Hook 和 `codemirror` 总包依赖；保留实际使用的 `@codemirror/*` 模块，并更新第三方许可记录。
- 前端回归与生产构建、24 项 Rust 测试通过；浏览器中 38 项编辑交互、85 项表格/列表布局、6 组阅读一致性检查通过，公式按需加载显示正常。未进行正式版长时间内存压力测试，不宣称固定的内存降幅。

### 2026-10-09 — Click offset after callouts

- Reproduced the reported list-item clicks with a callout and an inline formula above them. At 15 px font size, each callout's vertical margins shifted the rendered lines approximately 21 px below CodeMirror's height map; two callouts accumulated approximately 42 px. Clicking the middle/bottom of the first list item selected the second.
- Replaced callout margins with transparent borders included in measured line height. Padding-box backgrounds and adjusted corner radii retain the visible spacing and rounded callout background. Mouse selection handling is unchanged.
- Fixture: `scripts/click-offset-regression.html` (button or `?autorun`; optional `font` and `width`). Checks actual DOM/height-map agreement, the reported Chinese text, single/multiline callouts, clicks at several vertical positions, forward/backward dragging, Shift-click, double-click and unchanged document content.
- macOS WKWebView: before the fix, 18 of the initial 24 click checks failed; afterward all 32 expanded checks passed at 15 px / 940 px width and 20 px / 520 px width. DOM and measured line boundaries agree after both callouts.
- Frontend tests and production build passed. Existing bundle-size advisory remains.
