import { t, errorMessage } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Upload } from "lucide-react";
import { useBrand } from "@/hooks/useBrand";
import { DEFAULT_BRAND, logoFromFile, saveBrand, type Brand } from "@/lib/branding";
import { IMAGE_FILE_ACCEPT } from "@/lib/imageFilePicker";

export function BrandSettings() {
  const brand = useBrand();
  const [name, setName] = useState(brand.name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setName(brand.name), [brand.name]);
  function update(value: Partial<Brand>) {
    try { saveBrand(value); setError(""); }
    catch (e) { setError(errorMessage(e)); }
  }
  return <section className="mne-settings__section" aria-labelledby="settings-brand">
    <h3 id="settings-brand">{t("工作区标识")}</h3>
    <form className="mne-settings__row" onSubmit={event => { event.preventDefault(); update({ name }); }}>
      <label htmlFor="brand-name">{t("顶部名称")}</label>
      <div className="mne-brand-controls">
        <input id="brand-name" value={name} maxLength={32} onChange={event => setName(event.target.value)} onBlur={() => { if (name !== brand.name) update({ name }); }} />
        <button type="submit" className="mne-settings__icon" aria-label={t("保存名称")} title={t("保存名称")} disabled={name === brand.name}><Check size={16} /></button>
        <button type="button" className="mne-settings__icon" aria-label={t("恢复默认名称")} title={t("恢复默认名称")} disabled={brand.name === DEFAULT_BRAND.name && name === brand.name} onClick={() => { setName(DEFAULT_BRAND.name); update({ name: DEFAULT_BRAND.name }); }}><RotateCcw size={15} /></button>
      </div>
    </form>
    <div className="mne-settings__row">
      <span>{t("顶部 Logo")}</span>
      <div className="mne-brand-controls">
        <img src={brand.logo} alt={t("当前 Logo")} className="mne-brand-preview" />
        <button type="button" className="mn-toolbar-btn" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />{t("上传图片")}</button>
        <button type="button" className="mne-settings__icon" aria-label={t("恢复默认 Logo")} title={t("恢复默认 Logo")} disabled={busy || brand.logo === DEFAULT_BRAND.logo} onClick={() => update({ logo: DEFAULT_BRAND.logo })}><RotateCcw size={15} /></button>
        <input ref={input} type="file" accept={IMAGE_FILE_ACCEPT} aria-label={t("上传 Logo 图片")} hidden disabled={busy} onChange={async event => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
          if (!file) return;
          setBusy(true); setError("");
          try { update({ logo: await logoFromFile(file) }); }
          catch { setError(t("无法读取 Logo，请选择有效图片（不超过 5 MB）")); }
          finally { setBusy(false); }
        }} />
      </div>
    </div>
    {error && <p className="mn-error" role="alert">{error}</p>}
  </section>;
}
