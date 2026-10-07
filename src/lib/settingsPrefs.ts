/** Local-only editor preferences. */
const PREFIX = "meteornote-editor.";
export type AppearanceMode = "system" | "light" | "dark";
export type EditorColorTheme = "system" | "parchment" | "cool" | "highContrast";
export const APPEARANCE_OPTIONS: {
    id: AppearanceMode;
    label: string;
}[] = [
    { id: "system", label: "跟随系统" },
    { id: "light", label: "浅色" },
    { id: "dark", label: "深色" },
];
export const EDITOR_THEME_OPTIONS: {
    id: EditorColorTheme;
    label: string;
}[] = [
    { id: "system", label: "默认" },
    { id: "parchment", label: "暖色纸张" },
    { id: "cool", label: "冷色纸张" },
    { id: "highContrast", label: "高对比" },
];
function get(key: string, fallback = ""): string {
    try {
        return localStorage.getItem(PREFIX + key) ?? fallback;
    }
    catch {
        return fallback;
    }
}
function set(key: string, value: string) {
    try {
        if (!value)
            localStorage.removeItem(PREFIX + key);
        else
            localStorage.setItem(PREFIX + key, value);
    }
    catch {
        /* ignore */
    }
}
function getBool(key: string, fallback: boolean): boolean {
    const raw = get(key);
    if (raw === "")
        return fallback;
    return raw === "1" || raw === "true";
}
function setBool(key: string, value: boolean) {
    set(key, value ? "1" : "0");
}
export const settingsPrefs = {
    getEditorFontSize: () => {
        const migrated = get("editor.fontSizeDefault13Migrated");
        const raw = get("editor.fontSize");
        if (migrated !== "1" && (raw === "" || raw === "15")) {
            set("editor.fontSize", "13");
            set("editor.fontSizeDefault13Migrated", "1");
        }
        const n = Number(get("editor.fontSize", "13"));
        return Number.isFinite(n) ? Math.min(20, Math.max(12, n)) : 13;
    },
    setEditorFontSize: (n: number) => set("editor.fontSize", String(n)),
    getEditorTheme: (): EditorColorTheme => {
        const v = get("editor.colorTheme", "system");
        return (EDITOR_THEME_OPTIONS.some((o) => o.id === v) ? v : "system") as EditorColorTheme;
    },
    setEditorTheme: (v: EditorColorTheme) => set("editor.colorTheme", v),
    getAppearance: (): AppearanceMode => {
        const v = get("appearance.mode", "system");
        return (APPEARANCE_OPTIONS.some((o) => o.id === v) ? v : "system") as AppearanceMode;
    },
    setAppearance: (v: AppearanceMode) => set("appearance.mode", v),
    getMenuBarIconEnabled: () => getBool("menubar.enabled", true),
    setMenuBarIconEnabled: (v: boolean) => setBool("menubar.enabled", v),
};
export function editorThemeBackground(theme: EditorColorTheme, dark: boolean): string | null {
    switch (theme) {
        case "parchment":
            return dark ? "#2e2920" : "#fdf7ed";
        case "cool":
            return dark ? "#1f242e" : "#f2f7fc";
        case "highContrast":
            return dark ? "#000000" : "#ffffff";
        default:
            return null;
    }
}
