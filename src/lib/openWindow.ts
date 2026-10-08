import { t } from "@/lib/i18n";
import type { SidebarPage } from "@/types/library";
import { encodeBootstrap } from "@/lib/bootstrap";
import { currentPlatform } from "./platform";
export async function openPageInNewWindow(page: SidebarPage, title: string): Promise<void> {
    const key = encodeURIComponent(encodeBootstrap(page));
    const url = `/?bootstrap=${key}`;
    try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const label = `content-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
        const win = new WebviewWindow(label, {
            url,
            title: title || "MeteorNoteEditor",
            width: 1100,
            height: 720,
            minWidth: 720,
            minHeight: 480,
            focus: true,
            decorations: true,
            ...(currentPlatform() === "macos" ? {
                titleBarStyle: "overlay" as const,
                hiddenTitle: true,
                acceptFirstMouse: true,
            } : {}),
        });
        win.once("tauri://error", (e) => {
            console.error("open window failed", e);
            window.alert(t("无法打开新窗口，请检查应用权限配置。"));
        });
    }
    catch {
        // 浏览器预览：新标签页
        window.open(url, "_blank", "noopener,noreferrer");
    }
}
