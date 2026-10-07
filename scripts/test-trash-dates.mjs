import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.TZ = "Asia/Shanghai";
const result = await build({
  entryPoints: ["src/views/TrashView.tsx"], bundle: true, write: false,
  platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" },
  plugins: [{ name: "trash-view-dependencies", setup(builder) {
    builder.onResolve({ filter: /^@\/(lib\/api|components\/Icon|store\/appStore)$/ }, () => ({ path: "mock", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
      contents: "export const useAppStore = {getState: () => ({refresh: async () => {}})}; export const Icon = () => null; export const listTrash = async () => []; export const emptyTrash = async () => {}; export const restoreTrashItem = async () => {}; export const permanentlyDeleteTrashItem = async () => {};",
    }));
  } }],
});
const module = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { TrashItemDates } = module.exports;
const render = (item) => renderToStaticMarkup(React.createElement(TrashItemDates, { item }));
const html = render({ createdAt: "2025-03-01T08:09:10Z", trashedAt: "2026-10-07T12:00:00Z" });
assert.match(html, /创建时间/);
assert.match(html, /删除时间/);
assert.match(html, /2025\/03\/01 16:09:10/);
assert.match(html, /2026\/10\/07 20:00:00/);
assert.match(html, /dateTime="2025-03-01T08:09:10.000Z"/);
for (const createdAt of [undefined, null, "", "invalid"]) {
  const legacy = render({ createdAt, trashedAt: "2026-10-07T12:00:00Z" });
  assert.match(legacy, /创建时间：<span>未知<\/span>/);
  assert.match(legacy, /2026\/10\/07 20:00:00/);
}
assert.equal((render({ trashedAt: "invalid" }).match(/未知/g) ?? []).length, 2);
console.log("Passed: creation/deletion dates, local timezone, legacy entries and invalid timestamps.");
