import { invoke, isTauri } from "@tauri-apps/api/core";
import { preparePdfDocument } from "../src/lib/pdfExport";
import writing from "../src-tauri/default-notes/writing.md?raw";
import "../src/styles/tokens.css";

const sample = `${writing}\n\n## 图片与公式\n\n![本地示例](${location.origin}/logo.png)\n\n行内公式 $x^2+y^2=z^2$。\n\n` +
  Array.from({ length: 80 }, (_, i) => `第 ${i + 1} 段：中文排版验证。这是一段用于检查跨页、长文和完整内容导出的文字。尾部内容不能因为编辑器虚拟滚动而丢失。`).join("\n\n") + "\n\n## 文档末尾\n\nPDF-END-MARKER\n";
async function run() {
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
