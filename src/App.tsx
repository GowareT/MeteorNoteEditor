import { t, errorMessage, getLocale, subscribeLocale } from "@/lib/i18n";
import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import { PageContent } from "@/components/PageContent";
import { SplitPanes } from "@/components/SplitPanes";
import { TabBar } from "@/components/TabBar";
import { Sidebar } from "@/components/Sidebar";
import { DocumentSafety } from "@/components/DocumentSafety";
import { FullTextSearch } from "@/components/FullTextSearch";
import { readBootstrapFromLocation } from "@/lib/bootstrap";
import { handleWindowDragMouseDown } from "@/lib/windowDrag";
import { useAppStore } from "@/store/appStore";
import "./App.css";

export default function App() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  const bootstrap = useAppStore(s => s.bootstrap);
  const select = useAppStore(s => s.select);
  const selected = useAppStore(s => s.selected);
  const split = useAppStore(s => s.split);
  const collapsed = useAppStore(s => s.sidebarCollapsed);
  const searchText = useAppStore(s => s.searchText);
  const setSearchText = useAppStore(s => s.setSearchText);
  const error = useAppStore(s => s.error);
  const clearError = useAppStore(s => s.clearError);
  useEffect(() => {
    void (async () => {
      await bootstrap();
      const page = readBootstrapFromLocation();
      if (page) await select(page);
    })();
  }, [bootstrap, select]);
  return <div className="mn-shell" key={locale}>
    <Sidebar />
    <main className="mn-main">
      <div className={`mn-detail-top${collapsed ? " is-sidebar-collapsed" : ""}`} data-tauri-drag-region onMouseDown={handleWindowDragMouseDown}>
        {split ? <div className="mn-detail-top__spacer" /> : <TabBar />}
        <div className="mn-detail-search mn-detail-top__btn" data-no-window-drag>
          <Icon name="magnifying-glass" size={13} />
          <input aria-label={t("搜索笔记")} placeholder={t("搜索")} value={searchText} onChange={e => setSearchText(e.target.value)} onKeyDown={event => { if (event.key === "Escape") setSearchText(""); }} />
        </div>
      </div>
      {error && <div className="mn-banner" role="alert"><span>{errorMessage(error)}</span><button onClick={clearError}>{t("关闭")}</button></div>}
      <DocumentSafety />
      <FullTextSearch />
      {split ? <SplitPanes /> : <div className="mn-main__body"><PageContent page={selected} /></div>}
    </main>
  </div>;
}
