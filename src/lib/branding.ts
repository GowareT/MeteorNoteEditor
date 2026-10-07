import { isSupportedImageFile } from "./imageFilePicker";

export const BRAND_KEY = "meteornote-editor.brand";
export const DEFAULT_BRAND = { name: "MeteorNoteEditor", logo: "/logo.png" };
export type Brand = typeof DEFAULT_BRAND;
export function readBrand(): Brand {
  try {
    const value = JSON.parse(localStorage.getItem(BRAND_KEY) || "{}");
    return {
      name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 32) : DEFAULT_BRAND.name,
      logo: typeof value.logo === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.logo) && value.logo.length < 500_000 ? value.logo : DEFAULT_BRAND.logo,
    };
  } catch { return { ...DEFAULT_BRAND }; }
}
export function saveBrand(update: Partial<Brand>) {
  const next = { ...readBrand(), ...update };
  next.name = next.name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!next.name || [...next.name].length > 32) throw new Error("名称需要 1–32 个字符");
  if (next.logo !== DEFAULT_BRAND.logo && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(next.logo) || next.logo.length >= 500_000)) throw new Error("Logo 图片无效或过大");
  localStorage.setItem(BRAND_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("mne-brand-changed"));
  return next;
}
export async function logoFromFile(file: File): Promise<string> {
  if (!isSupportedImageFile(file.name, file.type)) throw new Error("请选择常规图片格式");
  if (file.size > 5 * 1024 * 1024) throw new Error("Logo 图片不能超过 5 MB");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("图片无法读取");
    const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法处理图片");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
