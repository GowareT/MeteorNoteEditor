export const NOTEBOOK_EXPANSION_KEY = 'meteornote-editor.expandedNotebooks';

/** null means first use or damaged storage; [] explicitly means all collapsed. */
export function readNotebookExpansion(): Set<string> | null {
  try {
    const raw = localStorage.getItem(NOTEBOOK_EXPANSION_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every(item => typeof item === 'string') ? new Set(value) : null;
  } catch { return null; }
}
export function writeNotebookExpansion(value: ReadonlySet<string>) {
  try { localStorage.setItem(NOTEBOOK_EXPANSION_KEY, JSON.stringify([...value])); }
  catch { /* The tree remains usable if preference storage is unavailable. */ }
}
