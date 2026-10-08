import { t, errorMessage } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { searchNotes, type SearchHit } from "@/lib/api";
import { revealSearchResult } from "@/lib/searchLocation";
import { useAppStore } from "@/store/appStore";

export function FullTextSearch() {
  const query = useAppStore(state => state.searchText).trim();
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setHits([]); setError(""); setBusy(Boolean(query));
    const timer = setTimeout(() => {
      if (!query) return;
      void searchNotes(query).then(result => { if (!cancelled) setHits(result); })
        .catch(error => { if (!cancelled) setError(errorMessage(error)); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  if (!query) return null;
  return <section className="mne-search-results" aria-label={t("全文搜索结果")}>
    <header><strong><Search size={15} />{t("搜索结果")}</strong><button aria-label={t("关闭搜索")} title={t("关闭搜索")} onClick={() => useAppStore.getState().setSearchText("")}><X size={16} /></button></header>
    {busy ? <p role="status">{t("搜索中…")}</p> : error ? <p role="alert">{error}</p> : !hits.length ? <p>{t("没有匹配的笔记")}</p> : <>
      <p>{t("{0} 篇笔记", `${hits.length}${hits.length === 500 ? "+" : ""}`)}</p>
      <ul>{hits.map(hit => <li key={hit.path}><button onClick={async () => {
        revealSearchResult(hit.path, hit.line);
        await useAppStore.getState().select({ note: hit.path });
        const selected = useAppStore.getState().selected;
        if (typeof selected === "object" && "note" in selected && selected.note === hit.path) {
          useAppStore.getState().setSearchText("");
          revealSearchResult(hit.path, hit.line);
        }
      }}><strong>{hit.title}</strong><small>{hit.path} · {t("第 {0} 行", hit.line)}</small><span>{hit.excerpt}</span></button></li>)}</ul>
    </>}
  </section>;
}
