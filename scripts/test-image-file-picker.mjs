import assert from "node:assert/strict";
import { build } from "esbuild";

let selection = null;
let options;
globalThis.__testImageOpen = async (value) => { options = value; return selection; };
const result = await build({
  entryPoints: ["src/lib/imageFilePicker.ts"], bundle: true, write: false,
  platform: "node", format: "esm", logLevel: "silent",
  plugins: [{ name: "mock-native-picker", setup(builder) {
    builder.onResolve({ filter: /^@tauri-apps\/plugin-dialog$/ }, () => ({ path: "dialog", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const open = globalThis.__testImageOpen;" }));
  } }],
});
const { IMAGE_EXTENSIONS, IMAGE_FILE_ACCEPT, isSupportedImageFile, pickLocalImage } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
for (const extension of IMAGE_EXTENSIONS) {
  selection = `/tmp/图片名称.${extension.toUpperCase()}`;
  assert.equal(await pickLocalImage(), selection);
  assert.ok(IMAGE_FILE_ACCEPT.includes(`.${extension}`));
}
assert.deepEqual(options.filters, [{name:"图片",extensions:IMAGE_EXTENSIONS}]);
assert.equal(options.directory, false);
assert.equal(options.multiple, false);
for (const name of ["report.pdf", "archive.zip", "notes.md", "image.png.txt", "video.mp4", "image.heic", "image.tiff", "no-extension", "png"]) {
  selection = `/tmp/${name}`;
  assert.equal(isSupportedImageFile(selection), false);
  await assert.rejects(pickLocalImage, /请选择/);
}
assert.equal(isSupportedImageFile("image.png", "application/pdf"), false);
assert.equal(isSupportedImageFile("image.BMP", "image/x-ms-bmp"), true);
assert.equal(isSupportedImageFile("image.jpg", ""), true);
selection = null;
assert.equal(await pickLocalImage(), null);
console.log("Passed: native image filter, supported extensions, unsupported files, MIME checks, cancellation.");
delete globalThis.__testImageOpen;
