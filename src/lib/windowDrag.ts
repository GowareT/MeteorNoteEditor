import type { MouseEvent as ReactMouseEvent } from "react";

/** 顶栏空白处拖动窗口（macOS Overlay 下 CSS app-region 常不可靠） */
export async function startWindowDrag() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().startDragging();
  } catch {
    /* 浏览器预览无窗口 API */
  }
}

const NO_DRAG_SELECTOR =
  "button, input, textarea, a, select, [data-no-window-drag], .mn-tab, .mn-tab__close, .mn-tabbar__scroll-btn, .mn-detail-search, .mn-sidebar__traffic-btn, .mn-sidebar__resizer, .mn-note-side__resizer";

export function handleWindowDragMouseDown(
  event: ReactMouseEvent | MouseEvent,
) {
  if (event.button !== 0) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(NO_DRAG_SELECTOR)) return;
  void startWindowDrag();
}
