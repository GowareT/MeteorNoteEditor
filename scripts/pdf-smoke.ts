import { invoke, isTauri } from "@tauri-apps/api/core";
import { settingsPrefs } from "../src/lib/settingsPrefs";
import { preparePdfDocument } from "../src/lib/pdfExport";
import writing from "../src-tauri/default-notes/writing.md?raw";
import "../src/styles/tokens.css";

const sample = `# 空格与编号验证\n\n空格测试：A    B  C\tD\n\n9. 第一项    空格\n10. 第二项\n100. 第三项\n\n${writing}\n\n## 图片与公式\n\n![本地示例](${location.origin}/logo.png)\n\n行内公式 $x^2+y^2=z^2$。\n\n` +
  Array.from({ length: 80 }, (_, i) => `第 ${i + 1} 段：中文排版验证。这是一段用于检查跨页、长文和完整内容导出的文字。尾部内容不能因为编辑器虚拟滚动而丢失。`).join("\n\n") + "\n\n## 文档末尾\n\nPDF-END-MARKER\n";
async function run() {
  if (new URLSearchParams(location.search).get("font") === "20") settingsPrefs.getEditorFontSize = () => 20;
  let cleanup: (() => void) | undefined;
  try {
    if (new URLSearchParams(location.search).has("bad-image")) {
      let rejected = false;
      try { cleanup = await preparePdfDocument("# 图片失败\n\n![损坏图片](data:image/png;base64,bm90YW5pbWFnZQ==)\n", "test/note", ""); }
      catch { rejected = true; }
      cleanup?.();
      if (!rejected || document.querySelector(".mne-pdf-host")) throw new Error("Broken image did not cleanly abort export");
      document.querySelector("#result")!.textContent = "Passed: broken image blocks PDF and clears the export overlay.";
      return;
    }
    cleanup = await preparePdfDocument(sample, "test/note", "");
    const frozen = document.querySelector<HTMLElement>(".mne-pdf-ready")!;
    if (!frozen.textContent?.includes("PDF-END-MARKER")) throw new Error("Missing document tail");
    const body = frozen.querySelector<HTMLElement>(".mn-md")!;
    const bodyStyle = getComputedStyle(body);
    const expectedSize = Math.max(15, settingsPrefs.getEditorFontSize());
    if (Math.abs(parseFloat(bodyStyle.fontSize) - expectedSize) > 0.1) throw new Error("PDF does not follow the note font size");
    if (Math.abs(parseFloat(bodyStyle.lineHeight) / expectedSize - 1.84) > 0.01) throw new Error("PDF body line height differs from reading mode");
    const heading = frozen.querySelector<HTMLElement>(".mn-md-heading.h1")!;
    if (Math.abs(parseFloat(getComputedStyle(heading).fontSize) / expectedSize - 1.35) > 0.01) throw new Error("PDF heading scale differs from reading mode");
    if (!frozen.querySelector(".mn-md-blank-line")) throw new Error("Source blank-line spacing was lost");
    const spaced = [...frozen.querySelectorAll<HTMLElement>(".mn-md-p")].find(p => p.textContent?.includes("A    B  C"))!;
    if (!spaced || getComputedStyle(spaced).whiteSpace !== "break-spaces") throw new Error("PDF collapses literal spaces");
    const markers = [...frozen.querySelectorAll<HTMLElement>("[data-pdf-marker]")].slice(0, 3);
    if (markers.map(li => li.dataset.pdfMarker).join() !== "9.,10.,100.") throw new Error("Source list numbering was lost");
    for (const li of markers) {
      const markerStyle = getComputedStyle(li, "::before");
      if (parseFloat(getComputedStyle(li).paddingLeft) <= parseFloat(markerStyle.width)) throw new Error("List text overlaps its marker");
    }
    const output = new URLSearchParams(location.search).get("output");
    if (isTauri() && output) {
      await invoke("save_pdf", { destination: output });
      cleanup();
      await invoke("pdf_test_done", { error: null });
    } else {
      document.querySelector(".mne-pdf-status")?.remove();
      frozen.style.display = "block";
      document.querySelector("#result")!.textContent = "Passed: complete long document, Markdown, local image and math.";
    }
  } catch (error) {
    cleanup?.();
    document.querySelector("#result")!.textContent = String(error);
    if (isTauri()) await invoke("pdf_test_done", { error: String(error) });
  }
}
document.querySelector("#run")!.addEventListener("click", () => void run());
if (isTauri()) void run();
