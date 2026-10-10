import { t } from "@/lib/i18n";
import { open, save } from "@tauri-apps/plugin-dialog";
import * as api from "@/lib/api";
import { supportsNativePdf } from "./platform";

export type TransferKind = "files" | "folder" | "export-note" | "pdf" | "backup" | "restore";

export async function chooseLibraryTransfer(kind: TransferKind, notePath?: string, targetNotebookPath?: string) {
  const importing = kind === "files" || kind === "folder";
  if (importing && !targetNotebookPath) throw new Error(t("请先打开要导入到的笔记本"));
  if ((kind === "export-note" || kind === "pdf") && !notePath) throw new Error(t("未选择笔记"));
  if (kind === "pdf") {
    if (!supportsNativePdf()) throw new Error(t("直接导出 PDF 目前仅支持 macOS 和 Windows，请先导出 Markdown"));
    const selected = await save({ title: t("导出当前笔记为 PDF"), defaultPath: `${notePath!.split("/").pop()}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!selected) return null;
    const { exportNotePdf } = await import("./pdfExport");
    return exportNotePdf(notePath!, /\.pdf$/i.test(selected) ? selected : `${selected}.pdf`);
  }
  let paths: string[];
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  if (kind === "files" || kind === "folder" || kind === "restore") {
    const selected = await open({
      title: kind === "restore" ? t("恢复笔记库备份") : t("导入 Markdown 到「{0}」", targetNotebookPath),
      directory: kind === "folder", multiple: kind === "files",
      filters: kind === "folder" ? undefined : [{ name: kind === "restore" ? t("MeteorNoteEditor 备份") : "Markdown", extensions: kind === "restore" ? ["mnebackup"] : ["md", "markdown"] }],
    });
    if (!selected) return null;
    paths = Array.isArray(selected) ? selected : [selected];
  } else {
    const selected = await save({
      title: kind === "backup" ? t("备份笔记库") : t("导出当前笔记为 Markdown 文件夹（含图片）"),
      defaultPath: kind === "backup" ? `MeteorNoteEditor-${timestamp}.mnebackup` : `${notePath!.split("/").pop()}-${timestamp}`,
      filters: kind === "backup" ? [{ name: t("MeteorNoteEditor 备份"), extensions: ["mnebackup"] }] : undefined,
    });
    if (!selected) return null;
    paths = kind === "export-note" ? [selected, notePath!] : [selected];
  }
  if (kind === "restore" && !confirm(t("将备份恢复到新的笔记本分组，并恢复其中的回收站条目；现有笔记不会覆盖。继续？"))) return null;
  if (kind === "files" || kind === "folder") return api.transferLibrary("import", paths, targetNotebookPath);
  return api.transferLibrary(kind, paths);
}
