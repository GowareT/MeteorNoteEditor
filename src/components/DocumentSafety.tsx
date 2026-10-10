import { t, errorMessage } from "@/lib/i18n";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";

export function DocumentSafety() {
  useSyncExternalStore(api.documents.subscribe, api.documents.snapshot);
  const [closing, setClosing] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovered, setRecovered] = useState<api.RecoveredWindowDraft[]>([]);
  const allProblems = [...api.documents.documents.values()].filter(doc => doc.error);
  const problems = allProblems.filter(doc => doc.dismissedError !== doc.error);
  const hiddenCount = allProblems.length - problems.length;
  useEffect(() => {
    let disposed = false;
    void api.recoveredWindowDrafts().then(entries => { if (!disposed) setRecovered(entries); }).catch(error => { if (!disposed) setError(errorMessage(error)); });
    let changes = Promise.resolve();
    const pathChanges = isTauri() ? listen<api.PathChange>("mne-path-changed", event => {
      changes = changes.then(async () => {
        if (!disposed) await useAppStore.getState().applyPathChange(event.payload);
      }).catch(error => { if (!disposed) setError(errorMessage(error)); });
    }) : Promise.resolve(() => {});
    let polling = false;
    const pruneClosed = () => {
      const state = useAppStore.getState();
      const paths = new Set<string>();
      for (const page of [...state.tabs.map(tab => tab.page), state.selected])
        if (typeof page === "object" && "note" in page) paths.add(page.note);
      if (state.notePath) paths.add(state.notePath);
      api.documents.pruneClosed(paths);
    };
    const unsubscribeStore = useAppStore.subscribe((state, previous) => {
      if (state.tabs !== previous.tabs || state.selected !== previous.selected || state.notePath !== previous.notePath)
        pruneClosed();
    });
    const poll = async () => {
      if (polling || disposed || document.hidden) return;
      polling = true;
      try {
        pruneClosed();
        for (const path of api.documents.documents.keys()) await api.documents.checkExternal(path);
        await useAppStore.getState().refresh();
      } catch (error) { setError(errorMessage(error)); }
      finally { polling = false; }
    };
    const interval = window.setInterval(() => void poll(), 2500);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    const blockEditing = (event: Event) => { if (locked.current) { event.preventDefault(); event.stopImmediatePropagation(); } };
    for (const name of ["keydown", "beforeinput", "paste", "drop", "pointerdown"]) window.addEventListener(name, blockEditing, true);
    const cancel = isTauri() ? listen("mne-close-cancelled", () => { locked.current = false; setClosing(false); }) : Promise.resolve(() => {});
    const unsubscribe = isTauri() ? listen<{quit: boolean; requestId: string}>("mne-save-before-close", async event => {
      if (disposed) return;
      locked.current = true;
      setClosing(true);
      try {
        await changes;
        await api.flushDrafts();
        await invoke("finish_close", { ...event.payload, success: true });
      } catch (error) {
        setError(t("尚未保存，窗口保持打开：{0}", errorMessage(error)));
        locked.current = false;
        setClosing(false);
        await invoke("finish_close", { ...event.payload, success: false });
      }
    }) : Promise.resolve(() => {});
    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
      unsubscribeStore();
      for (const name of ["keydown", "beforeinput", "paste", "drop", "pointerdown"]) window.removeEventListener(name, blockEditing, true);
      void unsubscribe.then(unlisten => unlisten());
      void cancel.then(unlisten => unlisten());
      void pathChanges.then(unlisten => unlisten());
    };
  }, []);
  async function resolve(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); await useAppStore.getState().refresh(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <>
    {closing && <div className="mne-closing" role="status">{t("正在保存，请稍候…")}</div>}
    {hiddenCount > 0 && <button className="mn-toolbar-btn" onClick={() => api.documents.showErrors()}>{t("查看已隐藏的保存提示（{0}）", hiddenCount)}</button>}
    {(error || problems.length > 0 || recovered.length > 0) && <section className="mne-save-problems" aria-label={t("保存与冲突处理")}>
      {error && <p role="alert">{error}</p>}
      {recovered.map(entry => <div key={`${entry.storageKey}/${entry.path}`}>
        <strong>{entry.path}</strong><p>{t("发现上次独立窗口中未保存的草稿")}</p>
        <button disabled={busy} onClick={() => void resolve(async () => {
          await api.restoreWindowDraft(entry);
          setRecovered(entries => entries.filter(item => item !== entry));
        })}>{t("恢复为新笔记")}</button>
      </div>)}
      {problems.map(doc => <div key={doc.path}>
        <strong>{doc.path}</strong><p role="alert">{errorMessage(doc.error)}</p>
        {doc.missing ? <>
          <p>{doc.draft !== doc.base ? t("原笔记已不存在，未保存的草稿仍保留。可另存副本，或在回收站恢复原笔记。") : t("原笔记已不存在，没有未保存的修改。")}</p>
          <button disabled={busy} onClick={() => void useAppStore.getState().select("trash")}>{t("打开回收站")}</button>
          {doc.draft !== doc.base && <>
            <button disabled={busy} onClick={() => void resolve(() => api.saveConflictCopy(doc.path))}>{t("将草稿另存为副本")}</button>
            <button disabled={busy} onClick={() => {
              if (confirm(t("确定放弃此未保存草稿？此操作无法撤销。"))) api.documents.forget(doc.path);
            }}>{t("放弃草稿")}</button>
          </>}
        </> : <>
          <button disabled={busy} onClick={() => void resolve(() => api.documents.save(doc.path))}>{t("重试保存")}</button>
          <button disabled={busy} onClick={() => void resolve(() => api.saveConflictCopy(doc.path))}>{t("将草稿另存为副本")}</button>
          <button disabled={busy} onClick={() => {
            if (confirm(t("放弃此未保存草稿，使用磁盘版本？"))) void resolve(() => api.documents.useDisk(doc.path));
          }}>{t("使用磁盘版本")}</button>
        </>}
        <button disabled={busy} onClick={() => api.documents.dismissError(doc.path)}>{t("关闭提示")}</button>
      </div>)}
      {error && <button onClick={() => setError("")}>{t("关闭提示")}</button>}
    </section>}
  </>;
}
