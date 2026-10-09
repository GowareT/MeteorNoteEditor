import assert from "node:assert/strict";
import { build } from "esbuild";

// Exercise the real store with an in-memory API; never touch the user's library.
const calls = [];
let failDelete = false;
let failSave = false;
globalThis.__deletionTestApi = {
  flushDrafts: async () => { if (failSave) throw new Error("Save failed"); },
  stageDraft: () => {},
  writeNote: async (path, body) => calls.push(["write", path, body]),
  moveNotebookToTrash: async (path) => {
    if (failDelete) throw new Error("Delete failed");
    calls.push(["trash", path]);
  },
  moveNoteToTrash: async (path) => calls.push(["trash", path]),
  loadLibrary: async () => [],
  listTrash: async () => [{ id: "trash" }],
  readNote: async () => "surviving draft",
};
const result = await build({
  entryPoints: ["src/store/appStore.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [{
    name: "test-library-api",
    setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/api$/ }, () => ({ path: "api", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: Object.keys(globalThis.__deletionTestApi).map((name) =>
          `export const ${name} = globalThis.__deletionTestApi.${name};`,
        ).join("\n"),
      }));
    },
  }],
  logLevel: "silent",
});
const { useAppStore: store } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const home = { id: "home", title: "Home", page: "workspaceHome" };
const note = { id: "note", title: "Note", page: { note: "Book/Child/Note" } };
const other = { id: "other", title: "Other", page: { note: "Book2/Note" } };
const initial = store.getState();
function reset(extra = {}) {
  calls.length = 0;
  failDelete = false;
  failSave = false;
  store.setState({ ...initial, tabs: [home, note, other], activeTabId: note.id,
    selected: note.page, notePath: note.page.note, noteDraft: "latest draft",
    favoriteKeys: new Set(["notebook:Book", "note:Book/Child/Note", "note:Book2/Note"]),
    expandedNotebooks: new Set(["Book", "Book/Child", "Book2"]), ...extra });
}
reset();
await store.getState().deleteNotebook("Book");
assert.deepEqual(calls, [["write", note.page.note, "latest draft"], ["trash", "Book"]]);
assert.equal(store.getState().notePath, null);
assert.deepEqual(store.getState().tabs, [home, other]);
assert.deepEqual([...store.getState().favoriteKeys], ["note:Book2/Note"]);
assert.deepEqual([...store.getState().expandedNotebooks], ["Book2"]);

reset({ tabs: [note] });
await store.getState().deleteNotebook("Book");
assert.equal(store.getState().tabs[0].page, "workspaceHome");
assert.equal(store.getState().notePath, null);

reset({ split: { orientation: "horizontal", ratio: 0.5, secondaryTabIds: [other.id],
  secondaryActiveId: other.id, focusedPane: "secondary" } });
await store.getState().deleteNotebook("Book");
assert.equal(store.getState().split.secondaryActiveId, other.id);
assert.deepEqual(store.getState().selected, other.page);
assert.equal(store.getState().activeTabId, home.id);

reset({ activeTabId: other.id, notePath: other.page.note, selected: note.page,
  split: { orientation: "horizontal", ratio: 0.5, secondaryTabIds: [note.id],
    secondaryActiveId: note.id, focusedPane: "secondary" } });
await store.getState().deleteNotebook("Book");
assert.equal(store.getState().split, null);
assert.deepEqual(store.getState().selected, other.page);
assert.equal(store.getState().notePath, other.page.note);

reset();
failDelete = true;
await store.getState().deleteNotebook("Book");
assert.equal(store.getState().error, "Delete failed");
assert.deepEqual(store.getState().tabs, [home, note, other]);
assert.equal(store.getState().noteDraft, "latest draft");

reset();
await store.getState().deleteNote(note.page.note);
assert.deepEqual(calls, [["write", note.page.note, "latest draft"], ["trash", note.page.note]]);
assert.equal(store.getState().notePath, null);
console.log("Passed: notebook deletion, drafts, nested paths, last tab, split panes, failure recovery, note deletion.");

for (const action of [() => store.getState().select(other.page), () => store.getState().closeTab(note.id), () => store.getState().closeAllTabs(), () => store.getState().closeOtherTabs(other.id), () => store.getState().beginTabSplit(other.id, "horizontal")]) {
  reset(); failSave = true;
  await action();
  assert.deepEqual(store.getState().tabs, [home, note, other]);
  assert.deepEqual(store.getState().selected, note.page);
  assert.equal(store.getState().noteDraft, "latest draft");
  assert.match(store.getState().error, /Save failed/);
}
console.log("Passed: failed saves prevent navigation, closing and split transitions.");
