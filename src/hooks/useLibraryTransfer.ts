import { useCallback, useRef, useState } from "react";
import { chooseLibraryTransfer, type TransferKind } from "@/lib/libraryTransfer";
import { useAppStore } from "@/store/appStore";

export function useLibraryTransfer(notePath?: string) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const run = useCallback(async (kind: TransferKind) => {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await chooseLibraryTransfer(kind, notePath);
      if (!result) return;
      await useAppStore.getState().refresh();
      setMessage(`已完成，${result.noteCount} 篇笔记 · ${result.path}`);
    } catch (error) { setError(String(error)); }
    finally { running.current = false; setBusy(false); }
  }, [notePath]);
  return { busy, message, error, run };
}
