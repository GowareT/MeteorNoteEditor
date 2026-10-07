import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PageContent } from "@/components/PageContent";
import { TabBar } from "@/components/TabBar";
import { useAppStore } from "@/store/appStore";
import "./SplitPanes.css";

export function SplitPanes() {
  const split = useAppStore((s) => s.split);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const setSplitRatio = useAppStore((s) => s.setSplitRatio);
  const focusSplitPane = useAppStore((s) => s.focusSplitPane);
  const dragRef = useRef<{
    start: number;
    startRatio: number;
    vertical: boolean;
  } | null>(null);

  const onDividerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!split) return;
      e.preventDefault();
      const vertical = split.orientation === "vertical";
      dragRef.current = {
        start: vertical ? e.clientY : e.clientX,
        startRatio: split.ratio,
        vertical,
      };
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const parent = target.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        const size = drag.vertical ? rect.height : rect.width;
        if (size <= 0) return;
        const delta = (drag.vertical ? ev.clientY : ev.clientX) - drag.start;
        setSplitRatio(drag.startRatio + delta / size);
      };
      const onUp = (ev: PointerEvent) => {
        dragRef.current = null;
        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setSplitRatio, split],
  );

  if (!split) return null;

  const primaryTab =
    tabs.find((t) => t.id === activeTabId) ??
    tabs.find((t) => !split.secondaryTabIds.includes(t.id));
  const secondaryTab =
    tabs.find((t) => t.id === split.secondaryActiveId) ??
    tabs.find((t) => split.secondaryTabIds.includes(t.id));

  const horizontal = split.orientation === "horizontal";

  return (
    <div
      className={`mn-split ${horizontal ? "is-horizontal" : "is-vertical"}`}
    >
      <div
        className={`mn-split__pane${
          split.focusedPane === "primary" ? " is-focused" : ""
        }`}
        style={
          horizontal
            ? { width: `${split.ratio * 100}%` }
            : { height: `${split.ratio * 100}%` }
        }
        onMouseDown={() => focusSplitPane("primary")}
      >
        <TabBar pane="primary" />
        <div className="mn-split__body">
          {primaryTab ? (
            <PageContent page={primaryTab.page} detachedNote />
          ) : null}
        </div>
      </div>

      <div
        className="mn-split__divider"
        role="separator"
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        onPointerDown={onDividerDown}
      />

      <div
        className={`mn-split__pane${
          split.focusedPane === "secondary" ? " is-focused" : ""
        }`}
        style={
          horizontal
            ? { width: `${(1 - split.ratio) * 100}%` }
            : { height: `${(1 - split.ratio) * 100}%` }
        }
        onMouseDown={() => focusSplitPane("secondary")}
      >
        <TabBar pane="secondary" />
        <div className="mn-split__body">
          {secondaryTab ? (
            <PageContent page={secondaryTab.page} detachedNote />
          ) : null}
        </div>
      </div>
    </div>
  );
}
