import { t } from "@/lib/i18n";
import { Download, Archive, ArchiveRestore } from "lucide-react";
import { useLibraryTransfer } from "@/hooks/useLibraryTransfer";

export function LibraryTransfer() {
  const { busy, message, error, run } = useLibraryTransfer();
  return <section className="mne-settings__section" aria-labelledby="settings-data">
    <h3 id="settings-data">{t("导出与备份")}</h3>
    <p className="mn-muted">{t("导入 Markdown：先打开目标笔记本，再点击右下角的“导入”。")}</p>
    <div className="mne-transfer-actions">
      <button disabled={busy} onClick={() => void run("export")}><Download size={16} />{t("导出全部笔记（Markdown）")}</button>
      <button disabled={busy} onClick={() => void run("backup")}><Archive size={16} />{t("备份笔记库")}</button>
      <button disabled={busy} onClick={() => void run("restore")}><ArchiveRestore size={16} />{t("恢复备份")}</button>
    </div>
    {busy && <p role="status">{t("处理中…")}</p>}
    {message && <p className="mne-transfer-result" role="status">{message}</p>}
    {error && <p className="mn-error mne-transfer-result" role="alert">{error}</p>}
  </section>;
}
