import { Download, Upload, Archive, ArchiveRestore } from "lucide-react";
import { useLibraryTransfer } from "@/hooks/useLibraryTransfer";

export function LibraryTransfer() {
  const { busy, message, error, run } = useLibraryTransfer();
  return <section className="mne-settings__section" aria-labelledby="settings-data">
    <h3 id="settings-data">导入、导出与备份</h3>
    <div className="mne-transfer-actions">
      <button disabled={busy} onClick={() => void run("files")}><Upload size={16} />导入 Markdown 文件</button>
      <button disabled={busy} onClick={() => void run("folder")}><Upload size={16} />导入文件夹</button>
      <button disabled={busy} onClick={() => void run("export")}><Download size={16} />导出全部 Markdown</button>
      <button disabled={busy} onClick={() => void run("backup")}><Archive size={16} />备份笔记库</button>
      <button disabled={busy} onClick={() => void run("restore")}><ArchiveRestore size={16} />恢复备份</button>
    </div>
    {busy && <p role="status">处理中…</p>}
    {message && <p className="mne-transfer-result" role="status">{message}</p>}
    {error && <p className="mn-error mne-transfer-result" role="alert">{error}</p>}
  </section>;
}
