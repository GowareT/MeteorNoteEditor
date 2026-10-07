import { useEffect, useState } from "react";

export function useWindowFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlistenResized: (() => void) | undefined;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const refresh = async () => {
          const next = await win.isFullscreen();
          if (!cancelled) setFullscreen(next);
        };

        await refresh();
        unlistenResized = await win.onResized(() => {
          void refresh();
        });
      } catch {
        if (!cancelled) setFullscreen(false);
      }
    })();

    return () => {
      cancelled = true;
      unlistenResized?.();
    };
  }, []);

  return fullscreen;
}
