import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const result = await build({ entryPoints: ["src/lib/platform.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { currentPlatform, supportsNativePdf, fileUrlToPath, resolveLocalImagePath, isValidWindowsName } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
assert.equal(fileUrlToPath("file:///C:/Users/test/%E5%9B%BE%20%E7%89%87.png"), "C:\\Users\\test\\图 片.png");
assert.equal(fileUrlToPath("file://server/share/image%20one.png"), "\\\\server\\share\\image one.png");
assert.equal(fileUrlToPath("file:///Users/test/image%20one.png"), "/Users/test/image one.png");
for (const absolute of ["C:\\Users\\test\\photo.png", "D:/images/图.png", "\\\\server\\share\\photo.png", "/Users/test/photo.png"]) {
  assert.equal(resolveLocalImagePath(absolute, "Book/Note", "C:\\data"), absolute);
}
assert.equal(resolveLocalImagePath("assets/photo.png", "Book/Note", "C:\\data\\"), "C:\\data/Book/Note/assets/photo.png");
assert.equal(resolveLocalImagePath("file:///C:/a.png", "Book/Note", "C:\\data"), "C:\\a.png");
for (const invalid of ["CON", "con.md", "NUL", "AUX.txt", "CON .txt", "COM1", "LPT9.md", "COM¹", "LPT².txt", "bad?", "bad*", "a|b", "a<b", "a\"b", "bad.", "bad ", "a\u0000b", "a\nb"]) assert.equal(isValidWindowsName(invalid), false, invalid);
for (const valid of ["会议记录", "My Note", "COM10", "NUL-safe", "notes.md"]) assert.equal(isValidWindowsName(valid), true, valid);
Object.defineProperty(globalThis, "navigator", { value: { platform: "Win32" }, configurable: true });
assert.equal(currentPlatform(), "windows"); assert.equal(supportsNativePdf(), true);
Object.defineProperty(globalThis, "navigator", { value: { platform: "MacIntel" }, configurable: true });
assert.equal(currentPlatform(), "macos"); assert.equal(supportsNativePdf(), true);
Object.defineProperty(globalThis, "navigator", { value: { platform: "Linux" }, configurable: true });
assert.equal(supportsNativePdf(), false);
delete globalThis.navigator;
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
assert.deepEqual(config.app.security.assetProtocol.scope, ["$DATA/MeteorNoteEditor/**"]);
const windows = JSON.parse(readFileSync("src-tauri/tauri.windows.conf.json", "utf8"));
assert.deepEqual(windows.bundle.targets, ["nsis"]);
assert.equal(windows.app.windows[0].decorations, true);
assert.equal(windows.app.windows[0].titleBarStyle, undefined);
console.log("Passed: Windows drive/UNC/file URLs, relative image paths, reserved names, platform capabilities and installer configuration.");
