import { useEffect, useState } from "react";

function isClearlyWindowed() {
  if (typeof window === "undefined") return true;
  // 略一离开铺满，就视为窗口模式（红绿灯会出现）
  return (
    window.outerWidth < window.screen.availWidth - 2 ||
    window.outerHeight < window.screen.availHeight - 8
  );
}

function isNearScreen() {
  if (typeof window === "undefined") return false;
  return (
    window.outerWidth >= window.screen.availWidth - 24 &&
    window.outerHeight >= window.screen.availHeight - 48
  );
}

/** 监听主窗口是否最大化 / 全屏（用于顶栏展示产品名等） */
export function useWindowMaximized() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlistenResized: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let cancelled = false;
    let lastArea =
      typeof window !== "undefined"
        ? window.outerWidth * window.outerHeight
        : 0;

    async function refresh() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const [isMax, isFull] = await Promise.all([
          win.isMaximized(),
          win.isFullscreen(),
        ]);
        if (cancelled) return;
        // 已明显是窗口模式时，以立刻隐藏为准，不再被 nearScreen 拖住
        if (isClearlyWindowed()) {
          setMaximized(false);
          return;
        }
        setMaximized(isMax || isFull || isNearScreen());
      } catch {
        if (!cancelled) setMaximized(false);
      }
    }

    function onGeometryChange() {
      const area =
        typeof window !== "undefined"
          ? window.outerWidth * window.outerHeight
          : 0;
      const shrinking = area < lastArea * 0.995;
      lastArea = area;

      // 缩小退出最大化时：标题立刻消失，不等 Tauri 异步结果
      if (shrinking || isClearlyWindowed()) {
        setMaximized(false);
      }
      void refresh();
    }

    void (async () => {
      await refresh();
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlistenResized = await win.onResized(() => {
          onGeometryChange();
        });
        unlistenMoved = await win.onMoved(() => {
          onGeometryChange();
        });
      } catch {
        /* 浏览器预览无 Tauri 窗口 API */
      }
    })();

    return () => {
      cancelled = true;
      unlistenResized?.();
      unlistenMoved?.();
    };
  }, []);

  return maximized;
}
