import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

Object.defineProperty(globalThis, "navigator", { value: { platform: "MacIntel" }, configurable: true });

let selection = null;
let options;
let calls = [];
let failure;
globalThis.__transferPicker = async value => { options = value; return selection; };
globalThis.__transferRun = async (operation, paths, targetNotebookPath) => {
  calls.push({ operation, paths, ...(targetNotebookPath ? {targetNotebookPath} : {}) });
  if (failure) throw failure;
  return { path: paths[0], noteCount: 1 };
};
globalThis.__pdfRun = async (notePath, destination) => {
  calls.push({ operation: "pdf", paths: [notePath, destination] });
  return { path: destination, noteCount: 1 };
};
globalThis.confirm = () => false;
const result = await build({
  entryPoints: ["src/lib/libraryTransfer.ts"], bundle: true, write: false,
  platform: "node", format: "esm", logLevel: "silent",
  plugins: [{ name: "mock-transfers", setup(builder) {
    builder.onResolve({ filter: /pdfExport$/ }, () => ({ path: "pdf", namespace: "test" }));
    builder.onResolve({ filter: /^(@tauri-apps\/plugin-dialog|@\/lib\/api)$/ }, args => ({ path: args.path, namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: args.path === "pdf" ? "export const exportNotePdf = globalThis.__pdfRun;" : args.path.includes("plugin-dialog")
      ? "export const open = globalThis.__transferPicker; export const save = open;"
      : "export const transferLibrary = globalThis.__transferRun;" }));
  } }],
});
const { chooseLibraryTransfer: run } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
for (const kind of ["files", "folder", "export-note", "pdf", "backup", "restore"]) {
  assert.equal(await run(kind, "Book/Note", "Book/Child"), null);
}
assert.equal(calls.length, 0);
selection = ["/tmp/first.md", "/tmp/second.markdown"];
await run("files", undefined, "Book/Child");
assert.equal(options.multiple, true);
assert.deepEqual(options.filters[0].extensions, ["md", "markdown"]);
assert.ok(options.title.includes("Book/Child"));
assert.deepEqual(calls.pop(), { operation: "import", paths: selection, targetNotebookPath: "Book/Child" });
selection = "/tmp/folder";
await run("folder", undefined, "Another Book");
assert.equal(options.directory, true);
assert.deepEqual(calls.pop(), { operation: "import", paths: [selection], targetNotebookPath: "Another Book" });
options = undefined;
await assert.rejects(() => run("files"), /请先打开/);
await assert.rejects(() => run("folder"), /请先打开/);
assert.equal(options, undefined, "Import without a notebook must not open a picker");
assert.equal(calls.length, 0);
await run("export-note", "Book/Note");
assert.ok(options.defaultPath.startsWith("Note-"));
assert.deepEqual(calls.pop(), { operation: "export-note", paths: [selection, "Book/Note"] });
await assert.rejects(() => run("export-note"), /未选择笔记/);
await assert.rejects(() => run("pdf"), /未选择笔记/);
await run("pdf", "Book/Note");
assert.deepEqual(options.filters, [{ name: "PDF", extensions: ["pdf"] }]);
assert.equal(options.defaultPath, "Note.pdf");
assert.deepEqual(calls.pop(), { operation: "pdf", paths: ["Book/Note", `${selection}.pdf`] });
await run("backup");
assert.deepEqual(options.filters[0].extensions, ["mnebackup"]);
assert.equal(calls.pop().operation, "backup");
assert.equal(await run("restore"), null);
assert.equal(calls.length, 0);
globalThis.confirm = () => true;
await run("restore");
assert.equal(calls.pop().operation, "restore");
failure = new Error("保存失败");
await assert.rejects(() => run("export-note", "Book/Note"), /保存失败/);
const view = await readFile("src/views/NoteEditorView.tsx", "utf8");
const more = view.slice(view.indexOf("const moreItems ="), view.indexOf("const outlineMenuItems ="));
assert.ok(!more.includes('label: t("插入")'));
for (const id of ["export-note", "export-pdf"]) assert.ok(more.includes(`id: "${id}"`));
assert.ok(!more.includes('id: "export-all"'));
assert.ok(!more.includes('id: "import"'));
const notebookView = await readFile("src/views/NotebookView.tsx", "utf8");
for (const id of ["import-files", "import-folder"]) assert.ok(notebookView.includes(`id: "${id}"`));
assert.ok(view.slice(view.indexOf("const editorMenuItems ="), view.indexOf("const moreItems =")).includes('label: t("插入")'));
console.log("Passed: notebook import destinations, required target, more-menu exports, current-note scope, picker cancellation, restore confirmation and save errors.");
Object.defineProperty(globalThis, "navigator", { value: { platform: "Win32" }, configurable: true });
options = undefined;
await assert.rejects(() => run("pdf", "Book/Note"), /仅支持 macOS/);
assert.equal(options, undefined, "Unsupported PDF export must not open a save dialog");
delete globalThis.navigator;
delete globalThis.__transferPicker;
delete globalThis.__transferRun;
delete globalThis.__pdfRun;
delete globalThis.confirm;
