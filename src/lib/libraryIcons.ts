/**
 * MeteorNote library icons — original colorful SVG artwork.
 * Licensed under MIT (same as this project). Free for commercial use.
 *
 * These icons are original vector drawings created for MeteorNote,
 * not derived from third-party emoji packs.
 */

export type LibraryIconId =
  | "folder"
  | "folder-blue"
  | "folder-green"
  | "folder-orange"
  | "folder-purple"
  | "folder-pink"
  | "folder-teal"
  | "document"
  | "book"
  | "notebook"
  | "memo"
  | "star"
  | "heart"
  | "lightbulb"
  | "rocket"
  | "leaf"
  | "flame"
  | "music"
  | "camera"
  | "code"
  | "brain"
  | "sparkles"
  | "bookmark"
  | "pin"
  | "coffee";

export interface LibraryIconDef {
  id: LibraryIconId;
  label: string;
  /** Inline SVG (viewBox 0 0 24 24) */
  svg: string;
  group: "folder" | "note" | "mark";
}

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">${body}</svg>`;

function folderSvg(front: string, tab: string, back: string) {
  return svg(`
    <path d="M3 7.5c0-.83.67-1.5 1.5-1.5H9l1.8 1.8H19.5c.83 0 1.5.67 1.5 1.5V18c0 .83-.67 1.5-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5Z" fill="${back}"/>
    <path d="M3 9.2h18V18c0 .83-.67 1.5-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9.2Z" fill="${front}"/>
    <path d="M3.6 6.6c0-.55.45-1 1-1H8.2l1.2 1.2H4.6c-.55 0-1-.45-1-1Z" fill="${tab}"/>
  `);
}

export const LIBRARY_ICONS: LibraryIconDef[] = [
  {
    id: "folder",
    label: "文件夹",
    group: "folder",
    svg: folderSvg("currentColor", "currentColor", "currentColor"),
  },
  {
    id: "folder-blue",
    label: "蓝文件夹",
    group: "folder",
    svg: folderSvg("#5B9DFF", "#3B82F6", "#2563EB"),
  },
  {
    id: "folder-green",
    label: "绿文件夹",
    group: "folder",
    svg: folderSvg("#4ADE80", "#22C55E", "#16A34A"),
  },
  {
    id: "folder-orange",
    label: "橙文件夹",
    group: "folder",
    svg: folderSvg("#FB923C", "#F97316", "#EA580C"),
  },
  {
    id: "folder-purple",
    label: "紫文件夹",
    group: "folder",
    svg: folderSvg("#C084FC", "#A855F7", "#9333EA"),
  },
  {
    id: "folder-pink",
    label: "粉文件夹",
    group: "folder",
    svg: folderSvg("#F9A8D4", "#EC4899", "#DB2777"),
  },
  {
    id: "folder-teal",
    label: "青文件夹",
    group: "folder",
    svg: folderSvg("#5EEAD4", "#14B8A6", "#0D9488"),
  },
  {
    id: "document",
    label: "文档",
    group: "note",
    svg: svg(`
      <path d="M6 3.5h8.2L18.5 8v12.5A1.5 1.5 0 0 1 17 22H6a1.5 1.5 0 0 1-1.5-1.5v-17A1.5 1.5 0 0 1 6 3.5Z" fill="#EEF2FF"/>
      <path d="M14.2 3.5V7a1 1 0 0 0 1 1h3.3" fill="#C7D2FE"/>
      <path d="M8 12h8M8 15.5h8M8 19h5.5" stroke="#6366F1" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M6 3.5h8.2L18.5 8v12.5A1.5 1.5 0 0 1 17 22H6a1.5 1.5 0 0 1-1.5-1.5v-17A1.5 1.5 0 0 1 6 3.5Z" stroke="#818CF8" stroke-width="1" opacity=".35"/>
    `),
  },
  {
    id: "book",
    label: "书本",
    group: "note",
    svg: svg(`
      <path d="M4.5 5.2c0-.94.76-1.7 1.7-1.7H12v16.5H6.2A1.7 1.7 0 0 1 4.5 18.3V5.2Z" fill="#60A5FA"/>
      <path d="M19.5 5.2c0-.94-.76-1.7-1.7-1.7H12v16.5h5.8a1.7 1.7 0 0 0 1.7-1.7V5.2Z" fill="#3B82F6"/>
      <path d="M12 3.5v16.5" stroke="#1D4ED8" stroke-width="1.2"/>
      <path d="M7 7.5h3.2M7 10.5h3.2" stroke="#EFF6FF" stroke-width="1.2" stroke-linecap="round"/>
    `),
  },
  {
    id: "notebook",
    label: "笔记本",
    group: "note",
    svg: svg(`
      <rect x="5" y="3.5" width="14" height="17" rx="2" fill="#FDE68A"/>
      <rect x="5" y="3.5" width="3" height="17" rx="1" fill="#F59E0B"/>
      <path d="M10.5 8h5.5M10.5 11.5h5.5M10.5 15h4" stroke="#B45309" stroke-width="1.3" stroke-linecap="round"/>
    `),
  },
  {
    id: "memo",
    label: "便笺",
    group: "note",
    svg: svg(`
      <path d="M5.5 4h13a1.5 1.5 0 0 1 1.5 1.5V16l-4 4H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4Z" fill="#FEF3C7"/>
      <path d="M16 20v-3.2A1.3 1.3 0 0 1 17.3 15.5H20" fill="#FCD34D"/>
      <path d="M8 9h8M8 12.5h8M8 16h5" stroke="#D97706" stroke-width="1.25" stroke-linecap="round"/>
    `),
  },
  {
    id: "star",
    label: "星星",
    group: "mark",
    svg: svg(`
      <path d="M12 3.2 14.6 9l6.2.5-4.7 4 1.5 6L12 16.6 6.4 19.5l1.5-6-4.7-4L9.4 9 12 3.2Z" fill="#FBBF24" stroke="#F59E0B" stroke-width="0.8" stroke-linejoin="round"/>
    `),
  },
  {
    id: "heart",
    label: "爱心",
    group: "mark",
    svg: svg(`
      <path d="M12 20s-7.2-4.4-9.1-8.2C1.4 9 2.6 6.2 5.3 5.4c1.8-.5 3.5.2 4.5 1.5C10.8 5.6 12.5 4.9 14.3 5.4c2.7.8 3.9 3.6 2.4 6.4C19.2 15.6 12 20 12 20Z" fill="#FB7185" stroke="#E11D48" stroke-width="0.7"/>
    `),
  },
  {
    id: "lightbulb",
    label: "灵感",
    group: "mark",
    svg: svg(`
      <path d="M12 3.2a6 6 0 0 1 3.6 10.8c-.5.35-.8.9-.8 1.5v.7H9.2v-.7c0-.6-.3-1.15-.8-1.5A6 6 0 0 1 12 3.2Z" fill="#FDE047"/>
      <path d="M9.5 17.5h5M10 19.5h4" stroke="#CA8A04" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="12" cy="9.2" r="1.3" fill="#FEF9C3"/>
    `),
  },
  {
    id: "rocket",
    label: "火箭",
    group: "mark",
    svg: svg(`
      <path d="M12 3c3.5 2 5.5 5.8 5.2 10.2-.1 1.5-1.2 2.8-2.6 3.3l-2.6.9-2.6-.9c-1.4-.5-2.5-1.8-2.6-3.3C6.5 8.8 8.5 5 12 3Z" fill="#A78BFA"/>
      <circle cx="12" cy="10" r="1.8" fill="#EDE9FE"/>
      <path d="M8.2 14.8 6 19l3.2-1.2M15.8 14.8 18 19l-3.2-1.2" fill="#F97316"/>
      <path d="M10.5 17.8c.4 1.2.9 2.2 1.5 2.2s1.1-1 1.5-2.2" stroke="#FB923C" stroke-width="1.4" stroke-linecap="round"/>
    `),
  },
  {
    id: "leaf",
    label: "叶子",
    group: "mark",
    svg: svg(`
      <path d="M18.8 5.2c-5.4-.8-10.8 2-12.6 7.4-1.2 3.5.2 6.6 2.8 8 3.5-4.6 8.2-7.8 13.4-9.2-.4-2.4-1.6-4.6-3.6-6.2Z" fill="#4ADE80"/>
      <path d="M7.5 19.5c2.8-3.2 6.6-5.6 11-6.8" stroke="#166534" stroke-width="1.2" stroke-linecap="round"/>
    `),
  },
  {
    id: "flame",
    label: "火焰",
    group: "mark",
    svg: svg(`
      <path d="M12 3.5s2.2 2.8 2.2 5.2c0 1.4-.7 2.4-1.7 3.1 2.4-.2 4.5-2 4.5-5 2.8 2.6 4 5.6 4 8.2 0 4.1-3.4 7-9 7s-9-2.9-9-7c0-4.4 3.8-7.8 9-11.5Z" fill="#FB923C"/>
      <path d="M12 11.5s1.2 1.4 1.2 2.8c0 .8-.4 1.4-1 1.8 1.4-.1 2.5-1.1 2.5-2.7 1.5 1.4 2.2 3 2.2 4.4 0 2.2-1.9 3.7-4.9 3.7s-4.9-1.5-4.9-3.7c0-2.4 2.1-4.2 4.9-6.3Z" fill="#FDE047"/>
    `),
  },
  {
    id: "music",
    label: "音乐",
    group: "mark",
    svg: svg(`
      <path d="M9 17.5V7.2l10-2.2v10.2" stroke="#8B5CF6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="7.2" cy="17.6" r="2.4" fill="#A78BFA"/>
      <circle cx="17.2" cy="15.4" r="2.4" fill="#C4B5FD"/>
    `),
  },
  {
    id: "camera",
    label: "相机",
    group: "mark",
    svg: svg(`
      <rect x="3.5" y="7" width="17" height="12.5" rx="2.5" fill="#64748B"/>
      <path d="M8.2 7 9.4 4.8h5.2L16 7" fill="#94A3B8"/>
      <circle cx="12" cy="13.2" r="3.6" fill="#E2E8F0"/>
      <circle cx="12" cy="13.2" r="2.2" fill="#0EA5E9"/>
    `),
  },
  {
    id: "code",
    label: "代码",
    group: "mark",
    svg: svg(`
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" fill="#1E293B"/>
      <path d="M8.2 9.2 5.8 12l2.4 2.8M15.8 9.2 18.2 12l-2.4 2.8M13.2 8.5l-2.4 7" stroke="#38BDF8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    `),
  },
  {
    id: "brain",
    label: "思维",
    group: "mark",
    svg: svg(`
      <path d="M12 4.2c2.2 0 3.6 1.1 4.2 2.2 1.3.2 2.8 1.3 2.8 3.4 0 1.1-.5 2-1.2 2.6.7.5 1.2 1.4 1.2 2.5 0 1.8-1.3 3-2.8 3.2-.4 1.4-1.8 2.5-4.2 2.5s-3.8-1.1-4.2-2.5c-1.5-.2-2.8-1.4-2.8-3.2 0-1.1.5-2 1.2-2.5-.7-.6-1.2-1.5-1.2-2.6 0-2.1 1.5-3.2 2.8-3.4C8.4 5.3 9.8 4.2 12 4.2Z" fill="#F0ABFC"/>
      <path d="M12 5v14.2M9.2 8.5c.8-.5 1.8-.8 2.8-.8M9.5 12.2H12M9.8 15.5c.7.4 1.6.6 2.2.6" stroke="#A21CAF" stroke-width="1.1" stroke-linecap="round"/>
    `),
  },
  {
    id: "sparkles",
    label: "闪光",
    group: "mark",
    svg: svg(`
      <path d="M12 3.5 13.4 8.2 18 9.5l-4.6 1.4L12 15.5l-1.4-4.6L6 9.5l4.6-1.3L12 3.5Z" fill="#FBBF24"/>
      <path d="M18.2 13.2 18.9 15.4 21 16.1l-2.1.7-.7 2.2-.7-2.2-2.1-.7 2.1-.7.7-2.2Z" fill="#60A5FA"/>
      <path d="M6.2 14.5 6.8 16.2 8.5 16.8l-1.7.5-.6 1.8-.6-1.8-1.7-.5 1.7-.6.6-1.7Z" fill="#F472B6"/>
    `),
  },
  {
    id: "bookmark",
    label: "书签",
    group: "mark",
    svg: svg(`
      <path d="M7 3.8h10a1.2 1.2 0 0 1 1.2 1.2v15l-6.2-3.4L5.8 20V5A1.2 1.2 0 0 1 7 3.8Z" fill="#F87171"/>
      <path d="M8.2 7.2h7.6" stroke="#FEE2E2" stroke-width="1.3" stroke-linecap="round"/>
    `),
  },
  {
    id: "pin",
    label: "图钉",
    group: "mark",
    svg: svg(`
      <path d="M14.8 4.2 19.8 9.2 13 12.5 11.5 11 8.2 14.3 9.7 15.8 6.2 20l-.8-.8 4.2-3.5L8.1 14.2 9.6 12.7 6.3 6 11.3 4.2Z" fill="#F87171"/>
      <circle cx="15.8" cy="8.2" r="1.2" fill="#FEE2E2"/>
    `),
  },
  {
    id: "coffee",
    label: "咖啡",
    group: "mark",
    svg: svg(`
      <path d="M6 9.5h10.5v6.2A3.3 3.3 0 0 1 13.2 19H9.3A3.3 3.3 0 0 1 6 15.7V9.5Z" fill="#F5D0A9"/>
      <path d="M16.5 10.5H19a2 2 0 0 1 0 4h-2.5" stroke="#D6A57A" stroke-width="1.5"/>
      <path d="M5.2 20.2h12.2" stroke="#92400E" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M9 5.2c0 1 .6 1.4.6 2.3M12 4.5c0 1.1.7 1.5.7 2.5M14.8 5.2c0 1 .6 1.4.6 2.3" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round"/>
    `),
  },
];

const BY_ID = new Map(LIBRARY_ICONS.map((i) => [i.id, i]));

/** Map legacy SF Symbol / generic names → library icon ids */
const LEGACY_MAP: Record<string, LibraryIconId> = {
  folder: "folder",
  "folder.fill": "folder",
  "folder.badge.plus": "folder-blue",
  book: "book",
  "book.fill": "book",
  "book.closed": "book",
  doc: "document",
  "doc.text": "document",
  "doc.fill": "document",
  document: "document",
  "document-text": "document",
  star: "star",
  "star.fill": "star",
  heart: "heart",
  "heart.fill": "heart",
  lightbulb: "lightbulb",
  "lightbulb.fill": "lightbulb",
  "light-bulb": "lightbulb",
  info: "document",
  idea: "lightbulb",
  check: "star",
  warn: "flame",
  sparkles: "sparkles",
  bookmark: "bookmark",
  pin: "pin",
  "mappin": "pin",
};

export function normalizeLibraryIconId(
  raw: string | null | undefined,
  fallback: LibraryIconId = "document",
): LibraryIconId {
  if (!raw) return fallback;
  if (BY_ID.has(raw as LibraryIconId)) return raw as LibraryIconId;
  return LEGACY_MAP[raw] ?? fallback;
}

export function getLibraryIconDef(
  id: string | null | undefined,
  fallback: LibraryIconId = "document",
): LibraryIconDef {
  const nid = normalizeLibraryIconId(id, fallback);
  return BY_ID.get(nid) ?? BY_ID.get(fallback)!;
}

export function defaultIconForNotebook(raw?: string | null): LibraryIconId {
  return normalizeLibraryIconId(raw, "folder");
}

export function defaultIconForNote(raw?: string | null): LibraryIconId {
  return normalizeLibraryIconId(raw, "document");
}
