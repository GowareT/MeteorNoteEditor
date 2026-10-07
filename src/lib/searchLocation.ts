let pending: { path: string; line: number } | null = null;
export function revealSearchResult(path: string, line: number) {
  pending = { path, line };
  window.dispatchEvent(new Event("mne-reveal-search"));
}
export function takeSearchResult(path: string) {
  if (pending?.path !== path) return null;
  const result = pending;
  pending = null;
  return result;
}
