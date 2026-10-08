import { t, errorMessage } from "@/lib/i18n";
import { useCallback, useRef, useState } from "react";
import { chooseLibraryTransfer, type TransferKind } from "@/lib/libraryTransfer";
import { useAppStore } from "@/store/appStore";

export function useLibraryTransfer(notePath?: string, targetNotebookPath?: string) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const run = useCallback(async (kind: TransferKind, importTarget = targetNotebookPath) => {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await chooseLibraryTransfer(kind, notePath, importTarget);
      if (!result) return;
      await useAppStore.getState().refresh();
      setMessage(kind === "files" || kind === "folder"
        ? t("已导入 {0} 篇笔记到「{1}」", result.noteCount, result.path)
        : t("已完成，{0} 篇笔记 · {1}", result.noteCount, result.path));
    } catch (error) { setError(errorMessage(error)); }
    finally { running.current = false; setBusy(false); }
  }, [notePath, targetNotebookPath]);
  return { busy, message, error, run };
}
