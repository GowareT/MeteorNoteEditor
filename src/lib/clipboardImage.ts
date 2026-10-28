/** Prefer bitmap clipboard data over a text/HTML representation of the same image. */
export function clipboardImageFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return Array.from(data.files ?? []).find(file => file.type.startsWith('image/')) ?? null;
}

export async function readClipboardImage(): Promise<File | null> {
  if (typeof navigator.clipboard?.read !== 'function') return null;
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find(type => type.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    const extension = type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || 'png';
    return new File([blob], `clipboard.${extension}`, {type: blob.type || type});
  }
  return null;
}
