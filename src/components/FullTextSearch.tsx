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
        .catch(error => { if (!cancelled) setError(String(error)); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  if (!query) return null;
  return <section className="mne-search-results" aria-label="全文搜索结果">
    <header><strong><Search size={15} />搜索结果</strong><button aria-label="关闭搜索" title="关闭搜索" onClick={() => useAppStore.getState().setSearchText("")}><X size={16} /></button></header>
    {busy ? <p role="status">搜索中…</p> : error ? <p role="alert">{error}</p> : !hits.length ? <p>没有匹配的笔记</p> : <>
      <p>{hits.length}{hits.length === 500 ? "+" : ""} 篇笔记</p>
      <ul>{hits.map(hit => <li key={hit.path}><button onClick={async () => {
        revealSearchResult(hit.path, hit.line);
        await useAppStore.getState().select({ note: hit.path });
        const selected = useAppStore.getState().selected;
        if (typeof selected === "object" && "note" in selected && selected.note === hit.path) {
          useAppStore.getState().setSearchText("");
          revealSearchResult(hit.path, hit.line);
        }
      }}><strong>{hit.title}</strong><small>{hit.path} · 第 {hit.line} 行</small><span>{hit.excerpt}</span></button></li>)}</ul>
    </>}
  </section>;
}
