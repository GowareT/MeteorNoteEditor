# 开发指南

[返回中文项目说明](../README.zh-CN.md) · [贡献指南](../CONTRIBUTING.md)

## 环境准备

使用 Node.js 20、npm 和 Rust stable。仓库提供 `.nvmrc`，并提交 `package-lock.json` 与 `src-tauri/Cargo.lock` 以固定依赖解析结果。

macOS 需要 Xcode Command Line Tools；Windows 需要 Visual Studio C++ 桌面构建工具、Windows SDK、WebView2 Runtime 和 Rust MSVC 工具链。完整说明见 [Tauri 环境准备](https://v2.tauri.app/start/prerequisites/)。Linux 尚未验证，不应将本指南视为 Linux 支持承诺。

在仓库根目录运行：

```sh
npm ci
npm run tauri:dev
```

首次安装会下载依赖。开发端口固定为 `5183`，桌面窗口支持热更新。开发应用会使用实际的本地笔记库；测试文件操作请使用临时目录或隔离数据，重要内容先备份。

## 常用命令

以下命令均从仓库根目录运行：

| 命令 | 用途 |
| --- | --- |
| `npm run tauri:dev` | 启动完整桌面应用 |
| `npm run dev` | 仅启动前端开发服务 |
| `npm test` | 运行前端与项目回归脚本 |
| `npm run build` | TypeScript 检查与前端生产构建 |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked` | 原生存储与生命周期等单元测试 |
| `npm run tauri:build` | 构建当前平台桌面应用和安装包 |
| `npm run notices` | 更新第三方依赖声明 |

原生文件测试使用临时目录，部分图片测试会启动本机临时 HTTP 服务。

## 浏览器回归

启动 `npm run dev` 后，可打开以下开发测试页：

| 地址 | 验证内容 |
| --- | --- |
| `http://localhost:5183/scripts/editor-regression.html` | Markdown 格式组合、光标、表格和任务布局 |
| `http://localhost:5183/scripts/pointer-regression.html` | 正文、标题、列表、对齐和自动换行的点击、双击及正反向拖选；可切换字号、宽度和源码模式 |
| `http://localhost:5183/scripts/app-smoke.html` | 使用内存模拟数据的编辑、设置、列表与回收站流程 |
| `http://localhost:5183/scripts/notebook-import-regression.html` | 使用模拟对话框与内存数据检查目标笔记本、导入后刷新、取消与失败提示 |
| `http://localhost:5183/scripts/branding-regression.html` | 工作区标识相关检查 |
| `http://localhost:5183/scripts/pdf-smoke.html` | PDF 排版测试内容 |

这些页面不是网页版产品，也不能替代原生窗口、系统对话框、多窗口关闭和安装流程的验收。已完成的验证见 [验证记录](VERIFICATION.md)。

鼠标测试页使用内存中的示例文档，不会修改笔记。点击 `Run pointer checks` 运行检查，也可用 `?autorun&width=320&font=20` 自动运行；增加 `&source` 检查源码模式。自动检查通过合成鼠标事件覆盖坐标和选区逻辑，仍需手动检查真实双击、拖选和滚动。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| `src/components/NoteMarkdownEditor.tsx` | 编辑器组件 |
| `src/components/NoteEditorToolbar.tsx` | 编辑工具栏 |
| `src/lib/cm6/` | CodeMirror 实时预览、格式和编辑行为 |
| `src/views/NoteEditorView.tsx` | 笔记页面、大纲、保存与历史 |
| `src/views/NotebookView.tsx` | 笔记列表、时间与排序 |
| `src/components/Sidebar.tsx`、`src/store/appStore.ts` | 文档树与应用状态 |
| `src/lib/api.ts` | 前端与桌面原生命令的接口 |
| `src/lib/documentSessions.ts` | 文档草稿与保存会话 |
| `src-tauri/src/library.rs`、`src-tauri/src/storage.rs` | 笔记库与磁盘操作 |
| `src-tauri/src/transfer.rs` | 导入、导出和备份恢复 |
| `src-tauri/src/lifecycle.rs` | 窗口关闭与退出协调 |
| `src-tauri/default-notes/` | 新笔记库的默认示例 |
| `scripts/` | 回归检查与维护脚本 |
| `docs/screenshots/` | README 共用的应用效果截图与添加说明 |

当前桌面应用标识为 `org.meteornote.editor`，显示偏好使用 `meteornote-editor.` 前缀。笔记包结构与数据位置见 [使用指南](USER_GUIDE.md)。

## 构建与分发

macOS 产物位于 `src-tauri/target/release/bundle/macos/` 和 `src-tauri/target/release/bundle/dmg/`。Windows 构建自动合并 `src-tauri/tauri.windows.conf.json`，NSIS 安装包位于 `src-tauri/target/release/bundle/nsis/`。

[Windows 工作流](../.github/workflows/windows.yml) 配置了依赖安装、前端和原生测试、NSIS 打包及产物上传。实际是否通过应以对应提交的工作流结果为准，仓库文档未将其视为已通过的实机验证。

发布版本时：

1. 同步 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 和 `src-tauri/tauri.conf.json` 中的应用版本，以及 `README.md` 和 `README.zh-CN.md` 的版本说明。
2. 将 `CHANGELOG.md` 中对应的未发布内容归档为实际版本与发布日期。
3. 执行相关测试与构建，并在目标平台验收安装、编辑保存、导入导出、退出和卸载流程；卸载前备份测试数据。
4. 复核第三方依赖与素材声明，再按分发需求配置签名；macOS 公开分发还需考虑公证。仓库不包含证书或发布凭据。
5. 发布安装包时说明支持的平台、已知限制和验证范围。

第三方声明生成器需要已安装的前端依赖和可离线解析的 Cargo 依赖。目前声明基于生成时的宿主目标，其他目标平台和开发工具可能引入额外依赖；跨平台发布应单独复核。

## 仓库维护

依赖、编译产物、日志和本地配置由 `.gitignore` 排除。不要提交真实笔记、备份、密钥或证书；默认示例笔记和应用图标属于项目源码，应保留。

修改依赖时同步锁文件；只修改文档时，无需重新生成第三方声明或运行完整构建。提交前检查相对链接、命令、平台说明与实际实现是否一致。

### Language and history regression checks

`npm test` checks translation keys and placeholders, preference persistence, cross-window language changes, English insertion snippets, and error messages that preserve user paths. UI messages use `t()` from `src/lib/i18n.ts`; add their English text to `src/lib/locales/en.ts`. Never translate note contents or filenames.

Open `/scripts/history-language-regression.html` during development to check formatted read-only history, delayed responses, failed reads, exact Markdown restoration, and language switching. All fixture writes stay in memory.
