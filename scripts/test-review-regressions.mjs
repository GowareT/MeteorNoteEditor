import assert from "node:assert/strict";
import { build } from "esbuild";

async function load(entry, plugins = []) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", plugins, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const { parseOutlineHeadings } = await load("src/lib/outline.ts");
const markdown = "# 标题\r\n\r\n```python\r\n# 注释\r\n```\r\n\r\n~~~~\r\n## 代码\r\n~~~\r\n# 仍是代码\r\n~~~~\r\n\r\n    # 缩进代码\r\n\r\n## **正文** ##\r\n\r\n下划线标题\r\n---\r\n";
const headings = parseOutlineHeadings(markdown);
assert.deepEqual(headings.map(h => [h.text, h.level]), [["标题", 1], ["正文", 2], ["下划线标题", 2]]);
assert.equal(headings[1].offset, markdown.indexOf("## **正文**"));
assert.deepEqual(parseOutlineHeadings("# 正文\n\n```\n# 未闭合代码").map(h => h.text), ["正文"]);

// Run the real API with a fake native transport; no user notes or caches are touched.
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
const disk = new Map([["Book/Note", "# Note\nbase"]]);
const copies = [];
let failCopy = false;
globalThis.__reviewInvoke = async (command, args) => {
  if (command === "list_notebooks") return [];
  if (command === "list_trash") return [];
  if (command === "write_note") {
    assert.equal(disk.get(args.path), args.expectedContent);
    disk.set(args.path, args.content);
    return;
  }
  if (command === "read_note") return disk.get(args.path);
  if (command === "copy_note_draft") {
    copies.push(args);
    if (failCopy) throw Error("missing attachment");
    const path = `Book/${args.title}`;
    disk.set(path, args.content);
    return path;
  }
  throw Error(`Unexpected command: ${command}`);
};
const api = await load("src/lib/api.ts", [{ name: "native-mock", setup(builder) {
  builder.onResolve({ filter: /^@tauri-apps\/api\// }, args => ({ path: args.path, namespace: "native-mock" }));
  builder.onLoad({ filter: /.*/, namespace: "native-mock" }, () => ({ contents: "export const invoke=(...args)=>globalThis.__reviewInvoke(...args); export const isTauri=()=>false; export const getCurrentWindow=()=>({label:'main'}); export const getAllWebviewWindows=async()=>[];" }));
} }]);
await api.readNote("Book/Note");
const draft = "# Note\n![photo](assets/photo.png)";
api.stageDraft("Book/Note", draft);
failCopy = true;
await assert.rejects(api.saveConflictCopy("Book/Note"), /missing attachment/);
assert.equal(api.documents.documents.get("Book/Note").draft, draft);
failCopy = false;
await api.saveConflictCopy("Book/Note");
assert.equal(copies.at(-1).content, draft);
assert.equal(api.documents.documents.get("Book/Note").draft, "# Note\nbase");
const entry = { path: "Book/Note", base: "# Note\nbase", draft, storageKey: "meteornote-editor.drafts.old-window" };
localStorage.setItem(entry.storageKey, JSON.stringify([entry]));
failCopy = true;
await assert.rejects(api.restoreWindowDraft(entry), /missing attachment/);
assert.equal(JSON.parse(localStorage.getItem(entry.storageKey)).length, 1);
failCopy = false;
await api.restoreWindowDraft(entry);
assert.equal(copies.at(-1).path, "Book/Note");
assert.deepEqual(JSON.parse(localStorage.getItem(entry.storageKey)), []);

// Apply a remote rename to the real store, including split panes and favorites.
globalThis.__reviewApi = api;
const { useAppStore: store } = await load("src/store/appStore.ts", [{ name: "shared-api", setup(builder) {
  builder.onResolve({ filter: /^@\/lib\/api$/ }, () => ({ path: "api", namespace: "shared-api" }));
  builder.onLoad({ filter: /.*/, namespace: "shared-api" }, () => ({ contents: Object.keys(api).map(key => `export const ${key}=globalThis.__reviewApi.${key};`).join("\n") }));
} }]);
api.stageDraft("Book/Note", "# Note\nlatest unsaved input");
store.setState({
  tabs: [{ id: "a", title: "Note", page: { note: "Book/Note" } }, { id: "b", title: "Book", page: { notebook: "Book" } }],
  activeTabId: "a", selected: { note: "Book/Note" }, notePath: "Book/Note", noteDraft: "# Note\nlatest unsaved input",
  split: { orientation: "horizontal", ratio: 0.5, secondaryTabIds: ["b"], secondaryActiveId: "b", focusedPane: "primary" },
  favoriteKeys: new Set(["note:Book/Note", "notebook:Book"]), expandedNotebooks: new Set(["Book"]),
});
disk.delete("Book/Note"); disk.set("Book/Renamed", "# Renamed\nbase");
await store.getState().applyPathChange({ from: "Book/Note", to: "Book/Renamed", kind: "note", before: "# Note\nbase", after: "# Renamed\nbase" });
assert.equal(store.getState().notePath, "Book/Renamed");
assert.equal(store.getState().noteDraft, "# Renamed\nlatest unsaved input");
assert.deepEqual(store.getState().selected, { note: "Book/Renamed" });
assert.equal(store.getState().tabs[0].title, "Renamed");
assert.ok(store.getState().favoriteKeys.has("note:Book/Renamed"));
await api.flushDrafts();
assert.equal(disk.get("Book/Renamed"), "# Renamed\nlatest unsaved input");
for (const [path, body] of [...disk]) if (path.startsWith("Book/")) { disk.delete(path); disk.set(path.replace("Book/", "Moved/"), body); }
await store.getState().applyPathChange({ from: "Book", to: "Moved", kind: "notebook" });
assert.deepEqual(store.getState().tabs[1].page, { notebook: "Moved" });
assert.deepEqual(store.getState().split.secondaryTabIds, ["b"]);
assert.ok(store.getState().expandedNotebooks.has("Moved"));
assert.ok(store.getState().favoriteKeys.has("note:Moved/Renamed"));
console.log("Passed: Markdown-aware outlines, CRLF offsets, attachment-copy routing and draft preservation on copy/recovery failure.");
console.log("Passed: remote renames update the active draft, tabs, split panes, favorites and expanded notebooks.");
