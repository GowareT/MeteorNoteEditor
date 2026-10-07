import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import clsx from "clsx";
import { iconForPage } from "@/lib/pageIcon";
import { openPageInNewWindow } from "@/lib/openWindow";
import { handleWindowDragMouseDown } from "@/lib/windowDrag";
import {
  pageKey,
  useAppStore,
  type BrowserTab,
  type SplitPane,
} from "@/store/appStore";
import "./TabBar.css";

const DRAG_THRESHOLD = 4;

export function TabBar({ pane }: { pane?: SplitPane }) {
  const allTabs = useAppStore((s) => s.tabs);
  const notebooks = useAppStore((s) => s.notebooks);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const split = useAppStore((s) => s.split);
  const favoriteKeys = useAppStore((s) => s.favoriteKeys);
  const activateTab = useAppStore((s) => s.activateTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const closeOtherTabs = useAppStore((s) => s.closeOtherTabs);
  const closeAllTabs = useAppStore((s) => s.closeAllTabs);
  const reorderTabs = useAppStore((s) => s.reorderTabs);
  const toggleTabPin = useAppStore((s) => s.toggleTabPin);
  const reloadTab = useAppStore((s) => s.reloadTab);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const beginTabSplit = useAppStore((s) => s.beginTabSplit);
  const endTabSplit = useAppStore((s) => s.endTabSplit);

  const tabs = useMemo(() => {
    if (!split || !pane) return allTabs;
    if (pane === "secondary") {
      return split.secondaryTabIds
        .map((id) => allTabs.find((t) => t.id === id))
        .filter((t): t is BrowserTab => !!t);
    }
    return allTabs.filter((t) => !split.secondaryTabIds.includes(t.id));
  }, [allTabs, pane, split]);

  const currentActiveId =
    split && pane === "secondary"
      ? split.secondaryActiveId
      : activeTabId;

  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    tab: BrowserTab;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [scrollState, setScrollState] = useState({
    overflow: false,
    canLeft: false,
    canRight: false,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);

  const syncScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const overflow = max > 1;
    setScrollState({
      overflow,
      canLeft: overflow && el.scrollLeft > 1,
      canRight: overflow && el.scrollLeft < max - 1,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const refresh = () => {
      if (currentActiveId) {
        const tabEl = el.querySelector<HTMLElement>(
          `[data-tab-id="${CSS.escape(currentActiveId)}"]`,
        );
        tabEl?.scrollIntoView({ inline: "nearest", block: "nearest" });
      }
      syncScrollState();
    };
    refresh();
    const raf = requestAnimationFrame(refresh);
    el.addEventListener("scroll", syncScrollState, { passive: true });
    const ro = new ResizeObserver(() => syncScrollState());
    ro.observe(el);
    window.addEventListener("resize", syncScrollState);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", syncScrollState);
      ro.disconnect();
      window.removeEventListener("resize", syncScrollState);
    };
  }, [syncScrollState, tabs.length, currentActiveId]);

  const scrollTabs = useCallback(
    (dir: -1 | 1) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.45), behavior: "smooth" });
    },
    [],
  );

  const openMenu = useCallback(
    (e: React.MouseEvent, tab: BrowserTab) => {
      e.preventDefault();
      e.stopPropagation();
      void activateTab(tab.id, pane);
      setMenu({ x: e.clientX, y: e.clientY, tab });
    },
    [activateTab, pane],
  );

  const indexAtPoint = useCallback((clientX: number) => {
    const root = scrollRef.current;
    if (!root) return -1;
    const nodes = [
      ...root.querySelectorAll<HTMLElement>("[data-tab-id]"),
    ];
    if (nodes.length === 0) return -1;
    for (let i = 0; i < nodes.length; i++) {
      const rect = nodes[i].getBoundingClientRect();
      const mid = (rect.left + rect.right) / 2;
      if (clientX < mid) return i;
    }
    return nodes.length - 1;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = Math.abs(e.clientX - drag.startX);
      if (!drag.moved) {
        if (dx < DRAG_THRESHOLD) return;
        drag.moved = true;
        setDraggingId(drag.id);
      }
      e.preventDefault();
      const toIndex = indexAtPoint(e.clientX);
      if (toIndex >= 0) {
        reorderTabs(drag.id, toIndex, pane);
      }
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const didMove = drag.moved;
      dragRef.current = null;
      setDraggingId(null);
      if (!didMove) {
        void activateTab(drag.id, pane);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [activateTab, indexAtPoint, pane, reorderTabs]);

  const menuItems = (tab: BrowserTab): ContextMenuItem[] => {
    const hasOtherCloseable = allTabs.some(
      (t) => t.id !== tab.id && !t.isPinned,
    );
    const hasCloseable = allTabs.some((t) => !t.isPinned);
    const fav = favoriteKeys.has(pageKey(tab.page));
    const canSplit = !split && allTabs.length >= 2;
    return [
      {
        id: "close",
        label: "关闭",
        disabled: !!tab.isPinned || allTabs.length <= 1,
        onSelect: () => void closeTab(tab.id),
      },
      {
        id: "close-others",
        label: "关闭其他标签",
        disabled: !hasOtherCloseable,
        onSelect: () => void closeOtherTabs(tab.id),
      },
      {
        id: "close-all",
        label: "全部关闭",
        disabled: !hasCloseable,
        onSelect: () => void closeAllTabs(),
      },
      { id: "sep-1", label: "", separator: true },
      {
        id: "split-h",
        label: "左右分屏",
        disabled: !canSplit,
        onSelect: () => beginTabSplit(tab.id, "horizontal"),
      },
      {
        id: "split-v",
        label: "上下分屏",
        disabled: !canSplit,
        onSelect: () => beginTabSplit(tab.id, "vertical"),
      },
      ...(split
        ? [
            {
              id: "end-split",
              label: "退出分屏",
              onSelect: () => endTabSplit(),
            } satisfies ContextMenuItem,
          ]
        : []),
      { id: "sep-split", label: "", separator: true },
      {
        id: "pin",
        label: tab.isPinned ? "取消固定" : "固定",
        onSelect: () => toggleTabPin(tab.id),
      },
      {
        id: "reload",
        label: "重新加载",
        onSelect: () => void reloadTab(tab.id),
      },
      {
        id: "fav",
        label: fav ? "取消收藏" : "收藏",
        onSelect: () => toggleFavorite(tab.page),
      },
      { id: "sep-2", label: "", separator: true },
      {
        id: "new-window",
        label: "在新窗口打开",
        onSelect: () => void openPageInNewWindow(tab.page, tab.title),
      },
    ];
  };

  return (
    <>
      <div
        className={clsx(
          "mn-tabbar",
          scrollState.overflow && "is-overflow",
        )}
        data-tauri-drag-region
        onMouseDown={handleWindowDragMouseDown}
      >
        {scrollState.overflow ? (
          <button
            type="button"
            className="mn-tabbar__scroll-btn"
            title="向左滚动"
            disabled={!scrollState.canLeft}
            data-no-window-drag
            onClick={() => scrollTabs(-1)}
          >
            <Icon name="chevron-left" size={14} />
          </button>
        ) : null}
        <div
          ref={scrollRef}
          className="mn-tabbar__scroll"
          data-no-window-drag
        >
          {tabs.map((tab) => {
            const active = tab.id === currentActiveId;
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className={clsx(
                  "mn-tab",
                  active && "is-active",
                  tab.isPinned && "is-pinned",
                  draggingId === tab.id && "is-dragging",
                )}
                data-no-window-drag
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  const target = e.target as HTMLElement;
                  if (target.closest(".mn-tab__close")) return;
                  e.stopPropagation();
                  dragRef.current = {
                    id: tab.id,
                    startX: e.clientX,
                    moved: false,
                    pointerId: e.pointerId,
                  };
                }}
                onContextMenu={(e) => openMenu(e, tab)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    void closeTab(tab.id);
                  }
                }}
              >
                {tab.isPinned ? (
                  <Icon name="pin" size={11} className="mn-tab__pin" />
                ) : null}
                <span className="mn-tab__icon" aria-hidden>
                  {iconForPage(tab.page, notebooks, 13)}
                </span>
                <span className="mn-tab__title">{tab.title}</span>
                {!tab.isPinned && allTabs.length > 1 ? (
                  <button
                    type="button"
                    className="mn-tab__close"
                    title="关闭"
                    onClick={(e) => {
                      e.stopPropagation();
                      void closeTab(tab.id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Icon name="x-mark" size={12} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {scrollState.overflow ? (
          <button
            type="button"
            className="mn-tabbar__scroll-btn"
            title="向右滚动"
            disabled={!scrollState.canRight}
            data-no-window-drag
            onClick={() => scrollTabs(1)}
          >
            <Icon name="chevron-right" size={14} />
          </button>
        ) : null}
      </div>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.tab)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
