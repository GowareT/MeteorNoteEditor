import { t } from "@/lib/i18n";
export function currentPlatform(): "macos" | "windows" | "other" {
  if (typeof navigator === "undefined") return "other";
  const platform = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ?? navigator.platform;
  if (/mac/i.test(platform)) return "macos";
  if (/win/i.test(platform)) return "windows";
  return "other";
}

export const supportsNativePdf = () => currentPlatform() === "macos";
export const revealFolderLabel = () => currentPlatform() === "macos" ? t("在访达中打开") : t("打开文件夹");

/** Convert file URLs without losing Windows drive letters or UNC server names. */
export function fileUrlToPath(source: string): string {
  if (!/^file:/i.test(source)) return source;
  const url = new URL(source);
  const pathname = decodeURIComponent(url.pathname);
  if (url.hostname && url.hostname !== "localhost") return `\\\\${url.hostname}${pathname.replace(/\//g, "\\")}`;
  if (/^\/[a-z]:\//i.test(pathname)) return pathname.slice(1).replace(/\//g, "\\");
  return pathname;
}

export function resolveLocalImagePath(source: string, notePath?: string | null, root?: string | null): string {
  const path = fileUrlToPath(source);
  if (/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path)) return path;
  if (!root || !notePath) return path;
  return `${root.replace(/[\\/]$/, "")}/${notePath}/${path}`;
}

export function isValidWindowsName(name: string): boolean {
  return name.length > 0 && !/[<>:"/\\|?*\u0000-\u001f]/.test(name)
    && !/[. ]$/.test(name)
    && !/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])[ ]*(?:\.|$)/i.test(name);
}
