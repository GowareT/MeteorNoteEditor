import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const result = await build({
  stdin: {
    contents: `export { SimpleMarkdown } from './src/components/SimpleMarkdown';
      export { SettingsView } from './src/views/SettingsView';
      export { settingsPrefs } from './src/lib/settingsPrefs';
      export { slashCompletions } from './src/lib/cm6/slashCommands';
      export { EditorState } from '@codemirror/state';
      export { CompletionContext } from '@codemirror/autocomplete';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true, write: false, platform: "node", format: "cjs",
  packages: "external", loader: { ".css": "empty" },
  plugins: [{ name: "ignore-style-imports", setup(builder) {
    builder.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: "test-css" }));
    builder.onLoad({ filter: /.*/, namespace: "test-css" }, () => ({ contents: "", loader: "js" }));
  } }],
});
const mod = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const { SimpleMarkdown, SettingsView, settingsPrefs, slashCompletions, EditorState, CompletionContext } = mod.exports;

const reads = [];
const values = new Map([
  ["meteornote-editor.profile.displayName", "Old name"],
  ["meteornote-editor.profile.avatar", "old-avatar"],
  ["meteornote-editor.editor.markdownStyles", ":root { --mn-md-h1-scale: 5; }"],
]);
globalThis.localStorage = {
  getItem(key) { reads.push(key); return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); },
};

assert.equal(settingsPrefs.getEditorFontSize(), 13);
settingsPrefs.setEditorFontSize(18);
assert.equal(settingsPrefs.getEditorFontSize(), 18);
settingsPrefs.setEditorFontSize(13);
settingsPrefs.setEditorTheme("cool");
assert.equal(settingsPrefs.getEditorTheme(), "cool");
settingsPrefs.setAppearance("dark");
assert.equal(settingsPrefs.getAppearance(), "dark");
settingsPrefs.setMenuBarIconEnabled(false);
assert.equal(settingsPrefs.getMenuBarIconEnabled(), false);
const settings = renderToStaticMarkup(React.createElement(SettingsView));
for (const label of ["通用设置", "窗口外观", "窗口字体大小", "页面主题", "在菜单栏显示图标", "笔记存储位置"]) assert.ok(settings.includes(label));
assert.doesNotMatch(settings, /头像|用户名|显示名称|登录|Markdown 样式|textarea|Old name|old-avatar/);
assert.ok(reads.every(key => !/profile|markdownStyles/.test(key)));
assert.ok(Object.keys(settingsPrefs).every(key => !/DisplayName|Avatar|Email|MarkdownStyle/.test(key)));

const source = '# Title\n\n[[Existing note]] **bold** *italic* ~~removed~~ <u>underlined</u> [Web](https://example.com)';
const html = renderToStaticMarkup(React.createElement(SimpleMarkdown, { source, titleMeta: { timeLabel: "最近修改 12:00" } }));
assert.ok(html.includes("[[Existing note]]"));
assert.match(html, /<strong[^>]*>bold<\/strong>/);
assert.match(html, /<em[^>]*>italic<\/em>/);
assert.match(html, /<(?:del|s)[^>]*>removed<\/(?:del|s)>/);
assert.match(html, /<u[^>]*>underlined<\/u>/);
assert.match(html, /href="https:\/\/example.com"/);
assert.ok(html.includes("最近修改 12:00"));
assert.doesNotMatch(html, /wikilink|title-meta__avatar|title-meta__name|<button/);

const state = EditorState.create({ doc: "/" });
const items = slashCompletions()(new CompletionContext(state, 1, true));
assert.ok(items.options.some(item => item.label === "/链接"));
assert.ok(items.options.some(item => item.label === "/图片"));
assert.ok(items.options.every(item => !/双链|wikilink/.test(item.label)));
for (const file of ["src/components/NoteMarkdownEditor.tsx", "src/views/NoteEditorView.tsx", "src/lib/cm6/livePreview.ts"]) {
  assert.doesNotMatch(readFileSync(file, "utf8"), /wikilink|Wikilink|NoteLinkPicker|displayName|avatar/);
}
console.log("Passed: simplified settings, ignored legacy profile/styles, literal double brackets, ordinary links, reading formats and slash menu.");
