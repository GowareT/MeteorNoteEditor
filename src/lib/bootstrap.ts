import type { SidebarPage } from "@/types/library";
export function encodeBootstrap(page: SidebarPage): string {
    if (typeof page === "string")
        return page;
    if ("note" in page)
        return `note:${page.note}`;
    return `notebook:${page.notebook}`;
}
export function decodeBootstrap(key: string): SidebarPage | null {
    const raw = key.trim();
    if (!raw)
        return null;
    if (raw === "workspaceHome" ||
        raw === "trash" ||
        raw === "settings") {
        return raw;
    }
    if (raw.startsWith("note:")) {
        const note = raw.slice("note:".length);
        return note ? { note } : null;
    }
    if (raw.startsWith("notebook:")) {
        const notebook = raw.slice("notebook:".length);
        return notebook ? { notebook } : null;
    }
    return null;
}
export function readBootstrapFromLocation(): SidebarPage | null {
    try {
        const params = new URLSearchParams(window.location.search);
        const key = params.get("bootstrap");
        if (!key)
            return null;
        return decodeBootstrap(decodeURIComponent(key));
    }
    catch {
        return null;
    }
}
