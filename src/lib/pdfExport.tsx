import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { SimpleMarkdown } from "@/components/SimpleMarkdown";
import { flushDrafts, readNote, libraryRootPath } from "./api";
import { resolveCodeLanguage } from "./codeHighlight";
import "@/styles/pages.css";
import "./pdfExport.css";

let exporting = false;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function bounded<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 20_000); })]); }
  finally { clearTimeout(timer!); }
}

// Printing uses a complete non-editable document, without virtual scrolling or editor controls.
export async function preparePdfDocument(source: string, notePath: string, rootPath: string) {
  if (exporting) throw new Error("正在导出 PDF，请稍候");
  exporting = true;
  const host = document.createElement("div");
  host.className = "mne-pdf-host";
  const status = document.createElement("div");
  status.className = "mne-pdf-status";
  status.setAttribute("role", "status");
  status.textContent = "正在生成 PDF…";
  const staging = document.createElement("div");
  staging.className = "mne-pdf-document mne-pdf-staging";
  host.append(staging, status);
  document.body.append(host);
  const reactRoot = createRoot(staging);
  const cleanup = () => {
    reactRoot.unmount();
    host.remove();
    document.body.classList.remove("mne-printing");
    exporting = false;
  };
  try {
    const languages = [...source.matchAll(/^\s*(?:`{3,}|~{3,})\s*([\w#+.-]+)/gm)].map(match => resolveCodeLanguage(match[1]));
    await bounded(Promise.all(languages.map(language => language?.load())), "代码高亮加载超时");
    flushSync(() => reactRoot.render(<SimpleMarkdown source={source} notePath={notePath} libraryRootPath={rootPath} />));
    await frame();
    await frame(); await frame();
    await bounded(Promise.all(Array.from(document.fonts).filter(font => font.family.startsWith("KaTeX")).map(font => font.load())), "公式字体加载超时");
    await bounded(document.fonts.ready, "字体加载超时，未生成 PDF");
    await bounded(Promise.all(Array.from(staging.querySelectorAll("img")).map(async image => {
      try { await image.decode(); }
      catch { throw new Error(`图片无法加载，未生成 PDF：${image.alt || "未命名图片"}`); }
    })), "图片加载超时，请检查网络或图片路径后重试");
    await frame();
    staging.classList.remove("mne-pdf-staging");
    staging.classList.add("mne-pdf-ready");
    document.body.classList.add("mne-printing");
    await frame(); await frame();
    return cleanup;
  } catch (error) { cleanup(); throw error; }
}

export async function exportNotePdf(notePath: string, destination: string) {
  await flushDrafts();
  const source = await readNote(notePath);
  const root = await libraryRootPath();
  const cleanup = await preparePdfDocument(source, notePath, root);
  const previousTitle = document.title;
  document.title = notePath.split("/").pop() || "笔记";
  try { await invoke("save_pdf", { destination }); }
  finally { document.title = previousTitle; cleanup(); }
  return { path: destination, noteCount: 1 };
}
