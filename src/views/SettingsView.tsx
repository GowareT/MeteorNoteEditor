import { t, errorMessage, getLocale, setLocale, type Locale } from "@/lib/i18n";
import { revealFolderLabel, currentPlatform } from "@/lib/platform";
import { useEffect, useState } from "react";
import { FolderOpen, RotateCcw } from "lucide-react";
import { settingsPrefs, APPEARANCE_OPTIONS, EDITOR_THEME_OPTIONS, type AppearanceMode, type EditorColorTheme } from "@/lib/settingsPrefs";
import * as api from "@/lib/api";
import { LibraryTransfer } from "@/components/LibraryTransfer";
import { BrandSettings } from "@/components/BrandSettings";
import "@/styles/pages.css";
import "./SettingsView.css";

export function SettingsView() {
  const [languagePending, setLanguagePending] = useState(false);
  async function updateLanguage(value: Locale) {
    setLanguagePending(true); setError("");
    try {
      await api.flushDrafts();
      await api.setAppLanguage(value);
      try { setLocale(value); }
      catch (error) { await api.setAppLanguage(getLocale()); throw error; }
    } catch (error) { setError(errorMessage(error)); }
    finally { setLanguagePending(false); }
  }
  const [fontSize, setFontSize] = useState(settingsPrefs.getEditorFontSize);
  const [theme, setTheme] = useState(settingsPrefs.getEditorTheme);
  const [appearance, setAppearance] = useState(settingsPrefs.getAppearance);
  const [menuBar, setMenuBar] = useState(settingsPrefs.getMenuBarIconEnabled);
  const [menuBarPending, setMenuBarPending] = useState(false);
  const [root, setRoot] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api.libraryRootPath().then(value => { if (active) setRoot(value); })
      .catch(e => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, []);
  const changed = () => window.dispatchEvent(new Event("mn-prefs-changed"));
  function updateFont(value: number) {
    setFontSize(value);
    settingsPrefs.setEditorFontSize(value);
    document.documentElement.style.setProperty("--mn-ui-font-size", `${value}px`);
    document.documentElement.style.setProperty("--mn-editor-font-size", `${value}px`);
    changed();
  }
  function updateAppearance(value: AppearanceMode) {
    setAppearance(value);
    settingsPrefs.setAppearance(value);
    if (value === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", value);
    changed();
  }
  async function updateMenuBar(next: boolean) {
    setMenuBarPending(true);
    setError("");
    try {
      await api.setMenuBarIconEnabled(next);
      setMenuBar(next);
      settingsPrefs.setMenuBarIconEnabled(next);
      changed();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMenuBarPending(false);
    }
  }
  return <div className="mn-page mne-settings">
    <header className="mn-panel-header"><h2>{t("通用设置")}</h2></header>
    <div className="mne-settings__body">
      {error && <p className="mn-error" role="alert">{error}</p>}
      <section className="mne-settings__section">
        <div className="mne-settings__row">
          <label htmlFor="app-language">语言 / Language</label>
          <select id="app-language" value={getLocale()} disabled={languagePending} aria-busy={languagePending}
            onChange={event => void updateLanguage(event.target.value as Locale)}>
            <option value="zh-CN">简体中文</option><option value="en">English</option>
          </select>
        </div>
      </section>
      <BrandSettings />
      <section className="mne-settings__section" aria-labelledby="settings-appearance">
        <h3 id="settings-appearance">{t("外观")}</h3>
        <div className="mne-settings__row">
          <span id="appearance-label">{t("窗口外观")}</span>
          <div className="mn-seg" role="group" aria-labelledby="appearance-label">
            {APPEARANCE_OPTIONS.map(o => <button key={o.id} aria-pressed={appearance === o.id} className={appearance === o.id ? "is-active" : ""} onClick={() => updateAppearance(o.id)}>{o.label}</button>)}
          </div>
        </div>
        <div className="mne-settings__row">
          <label htmlFor="window-font">{t("窗口字体大小")}</label>
          <div className="mne-settings__font">
            <input id="window-font" type="range" min={12} max={20} step={1} value={fontSize} aria-valuetext={`${fontSize} pt`} onChange={e => updateFont(Number(e.target.value))} />
            <output htmlFor="window-font">{fontSize} pt</output>
            <button className="mne-settings__icon" title={t("恢复默认字号（13 pt）")} aria-label={t("恢复默认字号")} disabled={fontSize === 13} onClick={() => updateFont(13)}><RotateCcw size={15} /></button>
          </div>
        </div>
      </section>
      <section className="mne-settings__section" aria-labelledby="settings-editor">
        <h3 id="settings-editor">{t("编辑器")}</h3>
        <div className="mne-settings__row">
          <label htmlFor="editor-theme">{t("页面主题")}</label>
          <select id="editor-theme" value={theme} onChange={e => {
            const value = e.target.value as EditorColorTheme;
            setTheme(value); settingsPrefs.setEditorTheme(value); changed();
          }}>{EDITOR_THEME_OPTIONS.map(o => <option value={o.id} key={o.id}>{o.label}</option>)}</select>
        </div>
      </section>
      <section className="mne-settings__section" aria-labelledby="settings-system">
        <h3 id="settings-system">{t("系统")}</h3>
        <div className="mne-settings__row">
          <label htmlFor="menu-bar">{currentPlatform() === "windows" ? t("在系统托盘显示图标") : t("在菜单栏显示图标")}</label>
          <input id="menu-bar" className="mne-settings__switch" type="checkbox" role="switch" checked={menuBar} disabled={menuBarPending} aria-busy={menuBarPending} onChange={e => void updateMenuBar(e.target.checked)} />
        </div>
        <div className="mne-settings__row mne-settings__storage">
          <div><span>{t("笔记存储位置")}</span><p>{root || t("正在读取…")}</p></div>
          <button className="mn-toolbar-btn" disabled={!root} onClick={() => {
            setError("");
            void api.revealInFinder("").catch(e => setError(errorMessage(e)));
          }}><FolderOpen size={16} />{revealFolderLabel()}</button>
        </div>
      </section>
      <LibraryTransfer />
      <footer className="mne-settings__about"><span>MeteorNoteEditor</span><span>0.1.0 · MIT</span></footer>
    </div>
  </div>;
}
