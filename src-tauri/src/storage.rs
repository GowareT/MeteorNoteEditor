use crate::{library, models::*};
use std::{fs::{self, OpenOptions}, io::Write, path::Path, sync::{Mutex, MutexGuard}};

static DATA_LOCK: Mutex<()> = Mutex::new(());
pub fn lock() -> LibraryResult<MutexGuard<'static, ()>> {
    DATA_LOCK.lock().map_err(|_| LibraryError::Message("存储锁异常，请重新打开应用".into()))
}

pub fn atomic_write(path: impl AsRef<Path>, content: impl AsRef<[u8]>) -> LibraryResult<()> {
    let path = path.as_ref();
    if fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err(LibraryError::Message("不能写入符号链接".into()));
    }
    let parent = path.parent().ok_or_else(|| LibraryError::Message("无效的写入路径".into()))?;
    let temp = parent.join(format!(".mne-write-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new().create_new(true).write(true).open(&temp)?;
        file.write_all(content.as_ref())?;
        file.sync_all()?;
        fs::rename(&temp, path)?;
        #[cfg(unix)] fs::File::open(parent)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(temp); }
    result
}

pub fn write_checked(path: &str, content: &str, expected: &str) -> LibraryResult<()> {
    let current = library::read_note(path)?;
    if current == content { return Ok(()); }
    if current != expected {
        return Err(LibraryError::Message("CONFLICT: 笔记已被其他窗口或软件修改，原文件未覆盖".into()));
    }
    library::write_note(path, content)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checked_write_preserves_external_content_and_snapshot_errors() {
        let root = std::env::temp_dir().join(format!("mne-storage-{}", uuid::Uuid::new_v4()));
        paths::with_test_root(root.clone(), || {
            let nb = library::create_notebook(Some("Test".into()), None).unwrap();
            let note = library::create_note(&nb, Some("Note".into())).unwrap();
            let original = library::read_note(&note).unwrap();
            write_checked(&note, "external", &original).unwrap();
            assert!(write_checked(&note, "stale draft", &original).unwrap_err().to_string().starts_with("CONFLICT:"));
            assert_eq!(fs::read_to_string(paths::notebook_path(&note).unwrap().join("Note.md")).unwrap(), "external");
            let versions = paths::notebook_path(&note).unwrap().join("versions");
            fs::remove_dir_all(&versions).unwrap();
            fs::write(&versions, "not a directory").unwrap();
            assert!(write_checked(&note, "next", "external").is_err());
            assert_eq!(fs::read_to_string(paths::notebook_path(&note).unwrap().join("Note.md")).unwrap(), "external");
        });
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn atomic_write_rejects_symlinks() {
        let root = std::env::temp_dir().join(format!("mne-atomic-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        atomic_write(root.join("note"), "first").unwrap();
        atomic_write(root.join("note"), "second").unwrap();
        assert_eq!(fs::read_to_string(root.join("note")).unwrap(), "second");
        #[cfg(unix)] {
            std::os::unix::fs::symlink(root.join("note"), root.join("link")).unwrap();
            assert!(atomic_write(root.join("link"), "bad").is_err());
        }
        assert!(!fs::read_dir(&root).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().starts_with(".mne-write")));
        fs::remove_dir_all(root).unwrap();
    }
}
