import { open, save } from "@tauri-apps/plugin-dialog";
import * as api from "@/lib/api";
import { supportsNativePdf } from "./platform";

export type TransferKind = "files" | "folder" | "export" | "export-note" | "pdf" | "backup" | "restore";

export async function chooseLibraryTransfer(kind: TransferKind, notePath?: string) {
  if ((kind === "export-note" || kind === "pdf") && !notePath) throw new Error("未选择笔记");
  if (kind === "pdf") {
    if (!supportsNativePdf()) throw new Error("直接导出 PDF 目前仅支持 macOS，请先导出 Markdown");
    const selected = await save({ title: "导出 PDF", defaultPath: `${notePath!.split("/").pop()}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!selected) return null;
    const { exportNotePdf } = await import("./pdfExport");
    return exportNotePdf(notePath!, /\.pdf$/i.test(selected) ? selected : `${selected}.pdf`);
  }
  let paths: string[];
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  if (kind === "files" || kind === "folder" || kind === "restore") {
    const selected = await open({
      title: kind === "restore" ? "恢复笔记库备份" : "导入 Markdown",
      directory: kind === "folder", multiple: kind === "files",
      filters: kind === "folder" ? undefined : [{ name: kind === "restore" ? "MeteorNoteEditor 备份" : "Markdown", extensions: kind === "restore" ? ["mnebackup"] : ["md", "markdown"] }],
    });
    if (!selected) return null;
    paths = Array.isArray(selected) ? selected : [selected];
  } else {
    const selected = await save({
      title: kind === "backup" ? "备份笔记库" : kind === "export-note" ? "导出当前笔记（含图片）" : "导出 Markdown 文件夹",
      defaultPath: kind === "backup" ? `MeteorNoteEditor-${timestamp}.mnebackup` : kind === "export-note" ? `${notePath!.split("/").pop()}-${timestamp}` : `Markdown-${timestamp}`,
      filters: kind === "backup" ? [{ name: "MeteorNoteEditor 备份", extensions: ["mnebackup"] }] : undefined,
    });
    if (!selected) return null;
    paths = kind === "export-note" ? [selected, notePath!] : [selected];
  }
  if (kind === "restore" && !confirm("将备份恢复到新的笔记本分组，并恢复其中的回收站条目；现有笔记不会覆盖。继续？")) return null;
  return api.transferLibrary(kind === "files" || kind === "folder" ? "import" : kind, paths);
}
