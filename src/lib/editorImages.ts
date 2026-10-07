import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { getCachedLibraryRootPath } from "./api";
import { resolveLocalImagePath } from "./platform";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Crop, Maximize2, ImagePlus, X, type LucideIcon } from "lucide-react";
import { IMAGE_FILE_ACCEPT, IMAGE_FORMAT_ERROR, isSupportedImageFile, pickLocalImage } from "./imageFilePicker";
import "../components/EditorMedia.css";

export type ImageCrop = { x: number; y: number; w: number; h: number };
export type ImageSettings = { label: string; width: number | null; crop: ImageCrop | null };

export function parseImageSettings(alt: string): ImageSettings {
  const cropMatch = /\|crop=([\d.,-]+)$/.exec(alt);
  let crop: ImageCrop | null = null;
  if (cropMatch) {
    const [x, y, w, h] = cropMatch[1].split(",").map(Number);
    if ([x, y, w, h].every(Number.isFinite) && x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.001 && y + h <= 1.001) crop = { x, y, w, h };
    alt = alt.slice(0, cropMatch.index);
  }
  const size = /\|(\d{1,5})(?:px)?$/.exec(alt);
  return { label: (size ? alt.slice(0, size.index) : alt) || "图片", width: size ? Math.max(40, Number(size[1])) : null, crop };
}

export function imageAlt(settings: ImageSettings) {
  const label = settings.label.replace(/[\[\]\r\n|]/g, " ").trim() || "图片";
  const crop = settings.crop;
  return label + (settings.width ? `|${Math.round(settings.width)}` : "") +
    (crop ? `|crop=${[crop.x, crop.y, crop.w, crop.h].map((n) => Number(n.toFixed(5))).join(",")}` : "");
}

export function resolveEditorImage(src: string, notePath?: string | null, root?: string | null) {
  let path = src.trim().replace(/^<([\s\S]*)>$/, "$1").replace(/\\([()])/g, "$1");
  if (/^(https?:|data:|blob:|asset:|tauri:)/i.test(path) || path.startsWith("//")) return path;
  path = resolveLocalImagePath(path, notePath, root || getCachedLibraryRootPath());
  return convertFileSrc(path);
}

export function applyImageCrop(frame: HTMLElement, img: HTMLImageElement, crop: ImageCrop | null) {
  if (!crop || !img.naturalWidth || !img.naturalHeight) {
    frame.style.aspectRatio = "";
    img.style.cssText = "";
    return;
  }
  frame.style.aspectRatio = String(img.naturalWidth * crop.w / (img.naturalHeight * crop.h));
  Object.assign(img.style, {
    position: "absolute", maxWidth: "none", width: `${100 / crop.w}%`, height: `${100 / crop.h}%`,
    left: `${-100 * crop.x / crop.w}%`, top: `${-100 * crop.y / crop.h}%`,
  });
}

export function mediaIconButton(icon: LucideIcon, title: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mn-media-icon";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = renderToStaticMarkup(createElement(icon, { size: 16, "aria-hidden": true }));
  return button;
}
export { Crop, Maximize2 };

function mediaDialog(title: string) {
  const dialog = document.createElement("dialog");
  dialog.className = "mn-media-dialog";
  dialog.setAttribute("aria-label", title);
  dialog.setAttribute("data-no-window-drag", "");
  const header = document.createElement("header");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const close = mediaIconButton(X, "关闭");
  close.onclick = () => dialog.close();
  header.append(heading, close);
  dialog.append(header);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  } });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

export function openImageInsertDialog(insert: (src: string) => Promise<void>) {
  const dialog = mediaDialog("插入图片");
  const local = document.createElement("button");
  local.type = "button";
  local.className = "mn-media-local";
  local.innerHTML = renderToStaticMarkup(createElement(ImagePlus, { size: 24, "aria-hidden": true }));
  local.append(document.createTextNode("选择本地图片"));
  const file = document.createElement("input");
  file.type = "file";
  file.accept = IMAGE_FILE_ACCEPT;
  file.hidden = true;
  const label = document.createElement("label");
  label.textContent = "图片地址";
  const url = document.createElement("input");
  url.type = "url";
  url.placeholder = "https://";
  label.append(url);
  const error = document.createElement("p");
  error.className = "mn-media-error";
  error.setAttribute("role", "alert");
  const actions = document.createElement("footer");
  const cancel = document.createElement("button");
  cancel.textContent = "取消";
  cancel.onclick = () => dialog.close();
  const confirm = document.createElement("button");
  confirm.textContent = "插入";
  confirm.className = "is-primary";
  const submit = async (src: string) => {
    confirm.disabled = local.disabled = true;
    error.textContent = "";
    try { await insert(src); dialog.close(); }
    catch (e) { error.textContent = e instanceof Error ? e.message : String(e); }
    finally { confirm.disabled = local.disabled = false; }
  };
  local.onclick = async () => {
    if (!isTauri()) { file.click(); return; }
    confirm.disabled = local.disabled = true;
    error.textContent = "";
    try {
      const selected = await pickLocalImage();
      if (selected && dialog.isConnected) await submit(selected);
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      confirm.disabled = local.disabled = false;
    }
  };
  confirm.onclick = () => {
    if (!/^https?:\/\//i.test(url.value.trim())) { error.textContent = "请输入有效的 http 或 https 图片地址"; return; }
    void submit(url.value.trim());
  };
  url.addEventListener("keydown", (event) => { if (event.key === "Enter") confirm.click(); });
  file.onchange = () => {
    const selected = file.files?.[0];
    file.value = "";
    if (!selected) return;
    if (!isSupportedImageFile(selected.name, selected.type)) { error.textContent = IMAGE_FORMAT_ERROR; return; }
    if (selected.size > 20 * 1024 * 1024) { error.textContent = "图片不能超过 20 MB"; return; }
    const reader = new FileReader();
    reader.onload = () => void submit(String(reader.result));
    reader.onerror = () => { error.textContent = "无法读取图片，请重新选择"; };
    reader.readAsDataURL(selected);
  };
  actions.append(cancel, confirm);
  dialog.append(local, file, label, error, actions);
}

export function openImageCropDialog(src: string, initial: ImageCrop | null, onSave: (crop: ImageCrop | null) => void) {
  const dialog = mediaDialog("裁剪图片");
  dialog.classList.add("is-crop");
  const stage = document.createElement("div");
  stage.className = "mn-media-crop-stage";
  const img = document.createElement("img");
  img.draggable = false;
  img.alt = "裁剪预览";
  const box = document.createElement("div");
  box.className = "mn-media-crop-box";
  let crop = initial ? { ...initial } : { x: 0, y: 0, w: 1, h: 1 };
  const paint = () => Object.assign(box.style, { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` });
  for (const corner of ["nw", "ne", "sw", "se"]) {
    const handle = document.createElement("span");
    handle.dataset.corner = corner;
    handle.className = `mn-media-crop-handle is-${corner}`;
    box.append(handle);
  }
  box.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    box.setPointerCapture(event.pointerId);
    const corner = (event.target as HTMLElement).dataset.corner;
    const start = { ...crop };
    const x = event.clientX, y = event.clientY;
    const bounds = stage.getBoundingClientRect();
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - x) / bounds.width, dy = (e.clientY - y) / bounds.height;
      if (!corner) crop = { ...start, x: Math.max(0, Math.min(1 - start.w, start.x + dx)), y: Math.max(0, Math.min(1 - start.h, start.y + dy)) };
      else {
        const left = corner.includes("w") ? Math.max(0, Math.min(start.x + start.w - 0.05, start.x + dx)) : start.x;
        const top = corner.includes("n") ? Math.max(0, Math.min(start.y + start.h - 0.05, start.y + dy)) : start.y;
        const right = corner.includes("e") ? Math.min(1, Math.max(start.x + 0.05, start.x + start.w + dx)) : start.x + start.w;
        const bottom = corner.includes("s") ? Math.min(1, Math.max(start.y + 0.05, start.y + start.h + dy)) : start.y + start.h;
        crop = { x: left, y: top, w: right - left, h: bottom - top };
        if (ratio.value !== "free") {
          const r = Number(ratio.value) / (img.naturalWidth / img.naturalHeight);
          const anchorX = corner.includes("w") ? start.x + start.w : start.x;
          const anchorY = corner.includes("n") ? start.y + start.h : start.y;
          const maxW = corner.includes("w") ? anchorX : 1 - anchorX;
          const maxH = corner.includes("n") ? anchorY : 1 - anchorY;
          const w = Math.min(crop.w, maxW, maxH * r), h = w / r;
          crop = { x: corner.includes("w") ? anchorX - w : anchorX, y: corner.includes("n") ? anchorY - h : anchorY, w, h };
        }
      }
      paint();
    };
    const end = () => { box.removeEventListener("pointermove", move); box.removeEventListener("pointerup", end); box.removeEventListener("pointercancel", end); };
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", end);
    box.addEventListener("pointercancel", end);
  });
  img.onload = () => {
    const ratio = img.naturalWidth / img.naturalHeight;
    stage.style.width = `${Math.min(680, window.innerWidth - 80, window.innerHeight * 0.55 * ratio)}px`;
    stage.style.aspectRatio = String(ratio);
    save.disabled = false;
  };
  const footer = document.createElement("footer");
  const ratio = document.createElement("select");
  ratio.setAttribute("aria-label", "裁剪比例");
  for (const [value, text] of [["free", "自由裁剪"], ["1", "1:1"], ["1.7777778", "16:9"], ["1.3333333", "4:3"]]) {
    const option = document.createElement("option"); option.value = value; option.textContent = text; ratio.append(option);
  }
  ratio.onchange = () => {
    if (ratio.value === "free") return;
    const normalizedRatio = Number(ratio.value) / (img.naturalWidth / img.naturalHeight);
    const w = Math.min(1, normalizedRatio), h = Math.min(1, 1 / normalizedRatio);
    crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h }; paint();
  };
  const reset = document.createElement("button"); reset.textContent = "重置";
  reset.onclick = () => { crop = { x: 0, y: 0, w: 1, h: 1 }; ratio.value = "free"; paint(); };
  const cancel = document.createElement("button"); cancel.textContent = "取消"; cancel.onclick = () => dialog.close();
  const save = document.createElement("button"); save.textContent = "应用裁剪"; save.className = "is-primary";
  save.disabled = true;
  img.onerror = () => { const error = document.createElement("p"); error.textContent = "图片加载失败，无法裁剪"; stage.replaceWith(error); };
  save.onclick = () => { onSave(crop.w === 1 && crop.h === 1 ? null : crop); dialog.close(); };
  footer.append(ratio, reset, cancel, save);
  stage.append(img, box); dialog.append(stage, footer); paint();
  img.src = src;
}
