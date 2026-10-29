import { t } from "@/lib/i18n";
import { Archive, ArchiveRestore } from "lucide-react";
import { useLibraryTransfer } from "@/hooks/useLibraryTransfer";

export function LibraryTransfer() {
  const { busy, message, error, run } = useLibraryTransfer();
  return <section className="mne-settings__section" aria-labelledby="settings-data">
    <h3 id="settings-data">{t("数据迁移与备份")}</h3>
    <p className="mn-muted">{t("将全部笔记、附件、历史版本和回收站打包为一个 .mnebackup 文件，可在 Windows 和 macOS 之间迁移。")}</p>
    <p className="mn-muted">{t("导入后放入新的笔记本分组，不覆盖现有内容。单次支持最多 256 MB 数据。")}</p>
    <div className="mne-transfer-actions">
      <button disabled={busy} onClick={() => void run("backup")}><Archive size={16} />{t("导出全部数据（迁移包）")}</button>
      <button disabled={busy} onClick={() => void run("restore")}><ArchiveRestore size={16} />{t("导入迁移包")}</button>
    </div>
    {busy && <p role="status">{t("处理中…")}</p>}
    {message && <p className="mne-transfer-result" role="status">{message}</p>}
    {error && <p className="mn-error mne-transfer-result" role="alert">{error}</p>}
  </section>;
}
