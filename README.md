# MeteorNoteEditor

**English** | [简体中文](README.zh-CN.md)

**Less fuss. Clean pages. Your notes, on your computer.**

Tired of note apps packed with features you never use, but still want the clean document layout of Feishu (Lark) Docs? That is the idea behind MeteorNoteEditor: a simple local Markdown notebook that makes everyday writing look good without making it complicated.

Open a note, write, and read it comfortably. Use Markdown or the editing toolbar, keep your files locally, and take them to another tool whenever you like. No account or server setup is required.

![MeteorNoteEditor on macOS: notebook sidebar and a clean Markdown editing page](docs/screenshots/overview.png)

## Why this notebook?

The focus is the page: readable text, useful formatting, and a quiet place to write. The Feishu reference is about that clean document experience. Markdown files and local storage keep the workflow straightforward.

Development priorities are editing, reading, and keeping notes safe. Everyday improvements—accurate text selection, consistent spacing, reliable tables, and predictable saving—matter more here than adding another layer of features.

## What you can do

- **Write with clean formatting.** Headings, lists, tasks, quotes, code highlighting, tables, images, and math; use the toolbar or type Markdown directly.
- **Choose how to see a note.** Live preview while writing, a read-only view for reading, or Markdown source for precise edits. Light and dark appearance, editor themes, and font size are adjustable.
- **Find and organize your notes.** Notebooks, favorites, and full-text search; sort by creation time, modification time, or name in either direction, or keep a manual order. Tabs, split views, and separate windows let you refer to another note while writing.
- **Keep your work locally.** Markdown files on your computer, with autosave, version history, trash, external change detection, and draft recovery.
- **Move and share your writing.** Import or export Markdown with image attachments, back up and restore the full library, and export the current note as PDF on macOS.

## Display modes

| Mode | Purpose |
| --- | --- |
| Live preview | See formatting as you type, suitable for everyday writing |
| Reading | Browse without accidentally editing the document |
| Source | Edit Markdown syntax directly for precise control |

Switch modes from the More (更多) menu at the top right of a note. Common Markdown content is supported. Extensions such as merged table cells, image cropping, colors, and alignment may render differently in other editors. See the [user guide (Chinese)](docs/USER_GUIDE.md) for details.

The interface supports English and Simplified Chinese. Choose **Settings → Language → English** to switch menus, dialogs, editor hints, and app messages. The choice is saved locally; note content and names stay unchanged.

## Platform status

The current project version is `0.1.0` and is still under development.

| Platform | Status |
| --- | --- |
| macOS | Local development and build checks completed. The build configuration requires macOS 12.0 or later; not every OS version has been tested. |
| Windows | Compatibility handling, NSIS packaging configuration, and a build workflow are included. Native Windows acceptance testing is still pending. |
| Linux | Not verified; no dedicated packaging configuration is provided. |
| Browser | Editor preview and development test pages are available. The app test page uses temporary in-memory notes; a standalone web notebook with persistent storage is not implemented. |

Direct PDF export is currently available only on macOS. The presence of a Windows workflow does not mean its builds have passed. See the [verification notes (Chinese)](docs/VERIFICATION.md) for completed checks and limitations.

## Run from source

### Desktop application

Install **Node.js 20**, npm, stable Rust, and the Tauri prerequisites for your platform:

- macOS: Xcode Command Line Tools.
- Windows: Visual Studio Build Tools with the Desktop development with C++ workload, Windows SDK, WebView2 Runtime, and the Rust MSVC toolchain.

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform setup. The initial dependency installation requires an internet connection.

```sh
git clone https://github.com/GowareT/MeteorNoteEditor.git
cd MeteorNoteEditor
npm ci
npm run tauri:dev
```

This opens the desktop application with hot reload. If you use nvm, run `nvm use` first; the repository includes an `.nvmrc` file.

Build the application for your current platform:

```sh
npm run tauri:build
```

Build artifacts are written to `src-tauri/target/release/bundle/`. See the [development guide (Chinese)](docs/DEVELOPMENT.md) for testing, packaging, and release preparation.

The project was extracted from MeteorNote and runs independently. It is built with React, TypeScript, CodeMirror 6, and Tauri 2.

### Browser preview

The editor can run in a browser. To try the development preview, install Node.js 20 and npm, then run these commands from the repository root; Rust and the native desktop build tools are not needed for this preview:

```sh
npm ci
npm run dev
```

Open one of these pages:

- `http://localhost:5183/scripts/app-smoke.html`: try editing the sample note and selected application flows with isolated test data.
- `http://localhost:5183/scripts/editor-regression.html`: try the editor examples and run formatting and interaction checks.

The sample note library lives in memory and resets when the page reloads. Some preferences and draft recovery data may remain in browser storage, but this is not a persistent web notebook. The normal application entry at `http://localhost:5183/` still expects Tauri for note storage and desktop commands. A complete browser edition would need its own storage and file import/export implementation; deploying `dist/` alone does not provide that functionality.

## Where notes are stored

| Platform | Default notes directory |
| --- | --- |
| macOS | `~/Library/Application Support/MeteorNoteEditor/Notebooks` |
| Windows | `%APPDATA%\MeteorNoteEditor\Notebooks` |

Each note has its own directory containing the Markdown document, image attachments, and version history. The `Trash` directory sits alongside `Notebooks`. You can open the local storage location from Settings (设置).

Use **Markdown export** to save the current note with its images for other Markdown tools. Use a **`.mnebackup` backup** to preserve the full library, including attachments, history, and trash. Backups do not include appearance preferences and are not encrypted. See [import, export, and backup (Chinese)](docs/USER_GUIDE.md#导入导出与备份) for details.

## Documentation and contributing

The following documents are currently available in Chinese:

- [User guide](docs/USER_GUIDE.md): editing, sorting, saving, import/export, and common questions.
- [Development guide](docs/DEVELOPMENT.md): setup, project structure, tests, and packaging.
- [Contributing guide](CONTRIBUTING.md): reporting bugs, discussing improvements, and submitting changes.
- [Screenshot guide](docs/screenshots/README.md): where to put application screenshots and how to display them in both READMEs.
- [Changelog](CHANGELOG.md): unreleased changes.
- [Security policy](SECURITY.md): data boundaries and vulnerability reporting.

To report a problem, [open an issue](https://github.com/GowareT/MeteorNoteEditor/issues) with your OS version, steps to reproduce, and a minimal example without personal data.

## License

Licensed under the [MIT License](LICENSE). Third-party dependencies and assets retain their respective licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
