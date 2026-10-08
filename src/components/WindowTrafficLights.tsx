import { t } from "@/lib/i18n";
import clsx from "clsx";
import { useWindowFullscreen } from "@/hooks/useWindowFullscreen";
import { currentPlatform } from "@/lib/platform";
import "./WindowTrafficLights.css";

type WindowTrafficLightsProps = {
  className?: string;
};

async function controlWindow(action: "close" | "minimize" | "restore") {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (action === "close") await win.close();
    else if (action === "minimize") await win.minimize();
    else await win.setFullscreen(false);
  } catch {
    /* 浏览器预览无原生窗口 */
  }
}

export function WindowTrafficLights({ className }: WindowTrafficLightsProps) {
  const fullscreen = useWindowFullscreen();
  const windows = currentPlatform() === "windows";

  if (windows && !fullscreen) return null;

  if (!fullscreen) {
    return (
      <div
        className={clsx("mn-window-traffic is-native", className)}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={clsx("mn-window-traffic is-custom", { "is-windows": windows }, className)}
      role="group"
      aria-label={t("窗口控制")}
      data-no-window-drag
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="mn-window-traffic__button is-close"
        title={t("关闭")}
        aria-label={t("关闭窗口")}
        onClick={() => void controlWindow("close")}
      >
        <span className="mn-window-traffic__glyph is-close" aria-hidden />
      </button>
      <button
        type="button"
        className="mn-window-traffic__button is-minimize"
        title={t("最小化")}
        aria-label={t("最小化窗口")}
        onClick={() => void controlWindow("minimize")}
      >
        <span className="mn-window-traffic__glyph is-minimize" aria-hidden />
      </button>
      <button
        type="button"
        className="mn-window-traffic__button is-restore"
        title={t("退出全屏")}
        aria-label={t("退出全屏")}
        onClick={() => void controlWindow("restore")}
      >
        <span className="mn-window-traffic__glyph is-restore" aria-hidden>
          <i />
          <i />
        </span>
      </button>
    </div>
  );
}
