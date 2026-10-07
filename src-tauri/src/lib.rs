mod library;
mod models;
mod storage;
mod transfer;
mod lifecycle;
pub mod pdf;

use models::*;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Emitter, WebviewWindow,
};

const TRAY_ID: &str = "meteor-note-editor-tray";
const APP_PREFS_FILE: &str = "app-prefs.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppPrefs {
    #[serde(default = "default_menu_bar_icon_enabled")]
    menu_bar_icon_enabled: bool,
}

impl Default for AppPrefs {
    fn default() -> Self {
        Self {
            menu_bar_icon_enabled: true,
        }
    }
}

fn default_menu_bar_icon_enabled() -> bool {
    true
}

fn app_prefs_path() -> LibraryResult<PathBuf> {
    Ok(models::paths::app_support()?.join(APP_PREFS_FILE))
}

fn read_app_prefs() -> AppPrefs {
    let path = match app_prefs_path() {
        Ok(p) => p,
        Err(_) => return AppPrefs::default(),
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_app_prefs(prefs: &AppPrefs) -> LibraryResult<()> {
    let path = app_prefs_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    storage::atomic_write(path, serde_json::to_vec_pretty(prefs)?)?;
    Ok(())
}


fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(true);
        if is_visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.unminimize();
        }
    }
}

fn ensure_tray_icon(app: &AppHandle) -> LibraryResult<()> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }

    let icon = Image::from_bytes(include_bytes!("../icons/icon.png"))
        .map_err(|e| LibraryError::Message(format!("无法加载托盘图标：{e}")))?;

    let menu = MenuBuilder::new(app)
        .item(
            &MenuItem::with_id(app, "tray-show", "显示 / 隐藏主窗口", true, None::<&str>)
                .map_err(|e| LibraryError::Message(format!("无法创建托盘菜单：{e}")))?,
        )
        .separator()
        .item(
            &MenuItem::with_id(app, "tray-quit", "退出", true, None::<&str>)
                .map_err(|e| LibraryError::Message(format!("无法创建托盘菜单：{e}")))?,
        )
        .build()
        .map_err(|e| LibraryError::Message(format!("无法创建托盘菜单：{e}")))?;

    let _ = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("MeteorNoteEditor")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|e| LibraryError::Message(format!("无法创建托盘：{e}")))?;
    Ok(())
}

fn sync_menu_bar_icon_enabled(app: &AppHandle, enabled: bool) -> LibraryResult<()> {
    let prefs = AppPrefs {
        menu_bar_icon_enabled: enabled,
    };
    write_app_prefs(&prefs)?;
    if enabled {
        ensure_tray_icon(app)?;
    } else {
        let _ = app.remove_tray_by_id(TRAY_ID);
    }
    Ok(())
}

#[tauri::command]
fn list_notebooks() -> Result<Vec<LibraryNotebook>, LibraryError> {
    let _guard = storage::lock()?;
    library::list_notebooks()
}

#[tauri::command]
fn read_note(path: String) -> Result<String, LibraryError> {
    let _guard = storage::lock()?;
    library::read_note(&path)
}

#[tauri::command]
fn write_note(path: String, content: String, expected_content: String) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    storage::write_checked(&path, &content, &expected_content)
}

#[tauri::command]
async fn store_note_asset(note_path: String, source_path: String) -> Result<String, LibraryError> {
    tauri::async_runtime::spawn_blocking(move || { let _guard = storage::lock()?; library::store_note_asset(&note_path, &source_path) })
        .await.map_err(|e| LibraryError::Message(e.to_string()))?
}

#[tauri::command]
fn list_note_versions(path: String) -> Result<Vec<NoteVersionInfo>, LibraryError> {
    let _guard = storage::lock()?;
    library::list_note_versions(&path)
}

#[tauri::command]
fn read_note_version(path: String, version_id: String) -> Result<String, LibraryError> {
    let _guard = storage::lock()?;
    library::read_note_version(&path, &version_id)
}

#[tauri::command]
fn restore_note_version(path: String, version_id: String) -> Result<String, LibraryError> {
    let _guard = storage::lock()?;
    library::restore_note_version(&path, &version_id)
}

#[tauri::command]
fn set_notebook_icon(path: String, icon: String) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::set_notebook_icon(&path, &icon)
}

#[tauri::command]
fn set_notebook_color(path: String, color_hex: Option<String>) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::set_notebook_color(&path, color_hex.as_deref())
}

#[tauri::command]
fn set_notebook_appearance(
    path: String,
    icon: String,
    color_hex: Option<String>,
) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::set_notebook_appearance(&path, &icon, color_hex.as_deref())
}

#[tauri::command]
fn set_note_icon(path: String, icon: String) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::set_note_icon(&path, &icon)
}

#[tauri::command]
fn set_note_color(path: String, color_hex: Option<String>) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::set_note_color(&path, color_hex.as_deref())
}

#[tauri::command]
fn set_note_appearance(
    path: String,
    icon: String,
    color_hex: Option<String>,
) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::set_note_appearance(&path, &icon, color_hex.as_deref())
}

#[tauri::command]
fn set_menu_bar_icon_enabled(app: AppHandle, enabled: bool) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    sync_menu_bar_icon_enabled(&app, enabled)
}

#[tauri::command]
fn create_note(notebook_path: String, title: Option<String>) -> Result<String, LibraryError> {
    let _guard = storage::lock()?;
    library::create_note(&notebook_path, title)
}

#[tauri::command]
fn create_notebook(
    preferred_name: Option<String>,
    parent_path: Option<String>,
) -> Result<String, LibraryError> {
    let _guard = storage::lock()?;
    library::create_notebook(preferred_name, parent_path)
}

#[derive(Clone, Serialize)]
struct PathChange {
    from: String,
    to: String,
    kind: &'static str,
    before: Option<String>,
    after: Option<String>,
}

fn change_path(window: WebviewWindow, path: String, kind: &'static str, operation: impl FnOnce() -> LibraryResult<String>) -> LibraryResult<PathChange> {
    let _guard = storage::lock()?;
    let before = if kind == "note" { Some(library::read_note(&path)?) } else { None };
    let to = operation()?;
    let after = if kind == "note" { Some(library::read_note(&to)?) } else { None };
    let change = PathChange { from: path, to, kind, before, after };
    if change.from != change.to {
        for other in window.app_handle().webview_windows().values() {
            if other.label() != window.label() { let _ = window.app_handle().emit_to(other.label(), "mne-path-changed", &change); }
        }
    }
    Ok(change)
}

#[tauri::command]
fn rename_note(window: WebviewWindow, path: String, new_title: String) -> LibraryResult<PathChange> {
    change_path(window, path.clone(), "note", || library::rename_note(&path, &new_title))
}

#[tauri::command]
fn rename_notebook(window: WebviewWindow, path: String, new_name: String) -> LibraryResult<PathChange> {
    change_path(window, path.clone(), "notebook", || library::rename_notebook(&path, &new_name))
}

#[tauri::command]
fn move_note(window: WebviewWindow, path: String, to_notebook_path: String) -> LibraryResult<PathChange> {
    change_path(window, path.clone(), "note", || library::move_note(&path, &to_notebook_path))
}

#[tauri::command]
fn move_notebook(window: WebviewWindow, path: String, to_parent_path: Option<String>, before_notebook_path: Option<String>) -> LibraryResult<PathChange> {
    change_path(window, path.clone(), "notebook", || library::move_notebook(&path, to_parent_path.as_deref(), before_notebook_path.as_deref()))
}

#[tauri::command]
fn copy_note_draft(path: String, title: String, content: String) -> LibraryResult<String> {
    let _guard = storage::lock()?;
    library::copy_note_draft(&path, &title, &content)
}

#[tauri::command]
fn reorder_notebooks(
    parent_path: Option<String>,
    ordered: Vec<String>,
) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::reorder_notebooks(parent_path.as_deref(), ordered)
}

#[tauri::command]
fn reorder_notes(notebook_path: String, ordered: Vec<String>) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::reorder_notes(&notebook_path, ordered)
}

#[tauri::command]
fn move_note_to_trash(path: String) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::move_note_to_trash(&path)
}

#[tauri::command]
fn move_notebook_to_trash(path: String) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::move_notebook_to_trash(&path)
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::reveal_in_finder(&path)
}

#[tauri::command]
fn list_trash() -> Result<Vec<LibraryTrashItem>, LibraryError> {
    let _guard = storage::lock()?;
    library::list_trash()
}

#[tauri::command]
fn restore_trash_item(id: String) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::restore_trash_item(&id)
}

#[tauri::command]
fn permanently_delete_trash_item(id: String) -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::permanently_delete_trash_item(&id)
}

#[tauri::command]
fn empty_trash() -> Result<(), LibraryError> {
    let _guard = storage::lock()?;
    library::empty_trash()
}

#[tauri::command]
fn library_stats() -> Result<LibraryStats, LibraryError> {
    let _guard = storage::lock()?;
    library::library_stats()
}

#[tauri::command]
fn library_root_path() -> Result<String, LibraryError> {
    let _guard = storage::lock()?;
    Ok(models::paths::notebooks_root()?.display().to_string())
}

#[tauri::command]
async fn search_notes(query: String) -> LibraryResult<Vec<transfer::SearchHit>> {
    tauri::async_runtime::spawn_blocking(move || { let _guard = storage::lock()?; transfer::search(&query) })
        .await.map_err(|e| LibraryError::Message(e.to_string()))?
}
#[tauri::command]
async fn transfer_library(operation: String, paths: Vec<String>) -> LibraryResult<transfer::TransferResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = storage::lock()?;
        let first = paths.first().ok_or_else(|| LibraryError::Message("未选择文件或目录".into()))?;
        match operation.as_str() {
            "import" => transfer::import_markdown(paths),
            "export" => transfer::export_markdown(first),
            "export-note" => transfer::export_note(first, paths.get(1).ok_or_else(|| LibraryError::Message("未选择笔记".into()))?),
            "backup" => transfer::backup(first),
            "restore" => transfer::restore(first),
            _ => Err(LibraryError::Message("不支持的文件操作".into())),
        }
    }).await.map_err(|e| LibraryError::Message(e.to_string()))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(lifecycle::Lifecycle::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                lifecycle::request_close(window);
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            lifecycle::finish_close,
            search_notes,
            transfer_library,
            pdf::save_pdf,
            list_notebooks,
            read_note,
            write_note,
            store_note_asset,
            list_note_versions,
            read_note_version,
            restore_note_version,
            set_notebook_icon,
            set_notebook_color,
            set_notebook_appearance,
            set_note_icon,
            set_note_color,
            set_note_appearance,
            set_menu_bar_icon_enabled,
            create_note,
            copy_note_draft,
            create_notebook,
            rename_note,
            rename_notebook,
            move_note,
            move_notebook,
            reorder_notebooks,
            reorder_notes,
            move_note_to_trash,
            move_notebook_to_trash,
            reveal_in_finder,
            list_trash,
            restore_trash_item,
            permanently_delete_trash_item,
            empty_trash,
            library_stats,
            library_root_path,
        ])
        .setup(|app| {
            let _ = library::ensure_roots();
            app.on_menu_event(|app, event| {
                if event.id().as_ref() == "tray-show" {
                    toggle_main_window(app);
                } else if event.id().as_ref() == "tray-quit" {
                    if app.webview_windows().is_empty() { app.exit(0); }
                    else { lifecycle::request_quit(app); }
                }
            });
            let prefs = read_app_prefs();
            if prefs.menu_bar_icon_enabled {
                let _ = sync_menu_bar_icon_enabled(app.handle(), true);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building MeteorNoteEditor")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let state = app.state::<lifecycle::Lifecycle>();
                if !state.0.lock().unwrap().approved && !app.webview_windows().is_empty() {
                    api.prevent_exit();
                    lifecycle::request_quit(app);
                }
            }
        });
}
