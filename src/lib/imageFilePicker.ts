import { t } from "@/lib/i18n";
import { open } from "@tauri-apps/plugin-dialog";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
const IMAGE_MIME_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp",
  "image/x-bmp", "image/x-ms-bmp", "image/svg+xml",
];
export const IMAGE_FILE_ACCEPT = [
  ...IMAGE_EXTENSIONS.map((extension) => `.${extension}`), ...IMAGE_MIME_TYPES,
].join(",");
export const IMAGE_FORMAT_ERROR = "请选择 PNG、JPG/JPEG、GIF、WebP、BMP 或 SVG 图片";

export function isSupportedImageFile(name: string, mime = "") {
  const filename = name.split(/[\\/]/).pop() ?? "";
  const extension = /\.([^.]+)$/.exec(filename)?.[1]?.toLowerCase();
  return Boolean(extension && IMAGE_EXTENSIONS.includes(extension) &&
    (!mime || mime === "application/octet-stream" || IMAGE_MIME_TYPES.includes(mime.toLowerCase())));
}

export async function pickLocalImage(): Promise<string | null> {
  const selected = await open({
    get title() { return t("选择图片"); },
    multiple: false,
    directory: false,
    filters: [{ get name() { return t("图片"); }, extensions: [...IMAGE_EXTENSIONS] }],
  });
  if (!selected) return null;
  if (typeof selected !== "string" || !isSupportedImageFile(selected)) {
    throw new Error(t(IMAGE_FORMAT_ERROR));
  }
  return selected;
}
