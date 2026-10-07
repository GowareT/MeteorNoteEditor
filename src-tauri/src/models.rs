use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryNote {
    pub id: String,
    pub title: String,
    pub notebook_path: String,
    #[serde(default = "default_note_icon")]
    pub icon: String,
    pub color_hex: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub modified_at: Option<String>,
}

fn default_note_icon() -> String {
    "document".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryNotebook {
    pub id: String,
    pub name: String,
    pub parent_path: Option<String>,
    pub icon: String,
    pub color_hex: Option<String>,
    pub notes: Vec<LibraryNote>,
    pub children: Vec<LibraryNotebook>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrashItem {
    pub id: String,
    pub kind: String,
    pub original_path: String,
    pub title: String,
    pub trashed_at: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub notebook_count: usize,
    pub note_count: usize,
    pub trash_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrashMeta {
    pub id: String,
    pub kind: String,
    pub original_path: String,
    pub title: String,
    pub trashed_at: chrono::DateTime<chrono::Utc>,
    #[serde(default)]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NotebookMeta {
    pub icon: String,
    pub color_hex: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NoteMeta {
    #[serde(default = "default_note_icon_meta")]
    pub icon: String,
    pub color_hex: Option<String>,
}

fn default_note_icon_meta() -> String {
    "document".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct OrderFile {
    pub notebooks: Vec<String>,
    pub notes: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl Serialize for LibraryError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type LibraryResult<T> = Result<T, LibraryError>;

pub fn valid_windows_name(name: &str) -> bool {
    if name.is_empty() || name.ends_with(['.', ' ']) || name.chars().any(|c| c < ' ' || "<>:\"/\\|?*".contains(c)) { return false; }
    let stem = name.split('.').next().unwrap_or("").trim_end().to_uppercase();
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL") { return false; }
    for prefix in ["COM", "LPT"] {
        if let Some(suffix) = stem.strip_prefix(prefix) {
            if matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³") { return false; }
        }
    }
    true
}

pub mod paths {
    use super::LibraryError;
    use std::path::PathBuf;

    #[cfg(test)]
    thread_local! {
        static TEST_ROOT: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
    }

    #[cfg(test)]
    pub fn with_test_root<T>(root: PathBuf, test: impl FnOnce() -> T) -> T {
        struct RestoreRoot(Option<PathBuf>);
        impl Drop for RestoreRoot {
            fn drop(&mut self) { TEST_ROOT.with(|slot| *slot.borrow_mut() = self.0.take()); }
        }
        let _restore = RestoreRoot(TEST_ROOT.with(|slot| slot.replace(Some(root))));
        test()
    }

    pub fn app_support() -> Result<PathBuf, LibraryError> {
        #[cfg(test)]
        if let Some(root) = TEST_ROOT.with(|slot| slot.borrow().clone()) { return Ok(root); }
        let base = dirs::data_dir()
            .or_else(dirs::home_dir)
            .ok_or_else(|| LibraryError::Message("无法定位用户数据目录".into()))?;
        Ok(base.join("MeteorNoteEditor"))
    }

    pub fn notebooks_root() -> Result<PathBuf, LibraryError> {
        Ok(app_support()?.join("Notebooks"))
    }

    pub fn trash_root() -> Result<PathBuf, LibraryError> {
        Ok(app_support()?.join("Trash"))
    }

    pub fn notebook_path(relative: &str) -> Result<PathBuf, LibraryError> {
        use std::path::{Component, Path};
        if relative.is_empty() || relative.contains('\\') || Path::new(relative).components().any(|part| !matches!(part, Component::Normal(_))) {
            return Err(LibraryError::Message("无效的笔记库相对路径".into()));
        }
        let mut candidate = notebooks_root()?;
        for part in Path::new(relative).components() {
            if cfg!(windows) && !super::valid_windows_name(&part.as_os_str().to_string_lossy()) {
                return Err(LibraryError::Message("路径包含 Windows 不支持的文件名".into()));
            }
            candidate.push(part);
            if std::fs::symlink_metadata(&candidate).is_ok_and(|meta| meta.file_type().is_symlink()) {
                return Err(LibraryError::Message("笔记库路径不能经过符号链接".into()));
            }
        }
        Ok(candidate)
    }

    pub fn trash_entry(id: &str) -> Result<PathBuf, LibraryError> {
        uuid::Uuid::parse_str(id).map_err(|_| LibraryError::Message("无效的回收站条目".into()))?;
        Ok(trash_root()?.join(id))
    }

}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteVersionInfo {
    pub id: String,
    pub created_at: String,
    pub size: u64,
    pub preview: String,
}

#[cfg(test)]
mod platform_tests {
    use super::*;

    #[test]
    fn windows_names_reject_devices_aliases_and_invalid_characters() {
        for name in ["CON", "con.md", "NUL", "AUX.txt", "CON .txt", "COM1", "LPT9.md", "COM¹", "LPT².txt", "bad?", "bad*", "a|b", "a<b", "a\"b", "bad.", "bad ", "a\0b", "a\nb"] {
            assert!(!valid_windows_name(name), "{name}");
        }
        for name in ["会议记录", "My Note", "COM10", "NUL-safe", "notes.md", ".note.json"] {
            assert!(valid_windows_name(name), "{name}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows_rejects_invalid_paths_before_creating_packages() {
        let root = std::env::temp_dir().join(format!("mne-win-{}", uuid::Uuid::new_v4()));
        paths::with_test_root(root.clone(), || {
            for name in ["CON", "AUX.txt", "Note.", "Book ", "bad?"] {
                assert!(crate::library::create_notebook(Some(name.into()), None).is_err());
                assert!(paths::notebook_path(&format!("Book/{name}")).is_err());
            }
        });
        if root.exists() { std::fs::remove_dir_all(root).unwrap(); }
    }
}
