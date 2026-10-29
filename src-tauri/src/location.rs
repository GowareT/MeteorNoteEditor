use crate::{models::*, storage};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::{Path, PathBuf}};

const FILE: &str = "storage-location.json";
fn invalid(text: &str) -> LibraryError { LibraryError::Message(text.into()) }

pub fn read_location(config: &Path) -> LibraryResult<PathBuf> {
    let path = config.join(FILE);
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(config.to_path_buf()),
        Err(error) => return Err(error.into()),
    };
    let root: PathBuf = serde_json::from_slice(&bytes)?;
    // Never silently initialize a replacement library when an external drive is absent.
    if !root.is_absolute() || !root.join("Notebooks").is_dir() || !root.join("Trash").is_dir() {
        return Err(invalid("保存位置不可用，请连接原磁盘并确认文件夹仍然存在"));
    }
    Ok(root)
}

fn same_directory(left: &Path, right: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let (Ok(a), Ok(b)) = (fs::metadata(left), fs::metadata(right)) {
            return a.dev() == b.dev() && a.ino() == b.ino();
        }
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(a), Ok(b)) if cfg!(windows) => a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase(),
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn digest(path: &Path) -> LibraryResult<Vec<u8>> {
    let mut file = fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop { let n = file.read(&mut buffer)?; if n == 0 { break; } hash.update(&buffer[..n]); }
    Ok(hash.finalize().to_vec())
}
fn copy(source: &Path, dest: &Path) -> LibraryResult<()> {
    let meta = fs::symlink_metadata(source)?;
    if meta.file_type().is_symlink() { return Err(invalid("迁移不支持符号链接，请先移除链接")); }
    if meta.is_dir() {
        fs::create_dir(dest)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            if entry.file_name().to_string_lossy().starts_with(".mne-write-") { continue; }
            copy(&entry.path(), &dest.join(entry.file_name()))?;
        }
    } else if meta.is_file() {
        let mut input = fs::File::open(source)?;
        let mut output = fs::OpenOptions::new().create_new(true).write(true).open(dest)?;
        std::io::copy(&mut input, &mut output)?;
        output.sync_all()?;
        drop(output);
        if digest(source)? != digest(dest)? { return Err(invalid("迁移校验失败，原保存位置未改变")); }
        if source.file_name().is_some_and(|name| name == ".note.json") {
            storage::atomic_write(dest, crate::library::portable_note_meta(source)?)?;
        }
        if let Ok(time) = meta.modified() {
            fs::OpenOptions::new().write(true).open(dest)?.set_times(fs::FileTimes::new().set_modified(time))?;
        }
    } else { return Err(invalid("迁移不支持特殊文件")); }
    Ok(())
}

/// Publish verified copies before changing the pointer. The source is retained.
pub fn migrate(source: &Path, folder: &str, config: &Path, allow: impl FnOnce(&Path) -> LibraryResult<()>) -> LibraryResult<PathBuf> {
    let folder = Path::new(folder);
    if !folder.is_absolute() { return Err(invalid("请选择有效的绝对文件夹路径")); }
    let parent = folder.canonicalize()?;
    if !parent.is_dir() { return Err(invalid("请选择文件夹")); }
    let source = source.canonicalize()?;
    let dest = parent.join("MeteorNoteEditor");
    if dest.exists() {
        if same_directory(&dest, &source) { return Ok(source); }
        return Err(invalid("目标文件夹已有 MeteorNoteEditor 数据，请选择其他文件夹，现有文件不会覆盖"));
    }
    if parent.ancestors().any(|ancestor| same_directory(ancestor, &source)) || source.starts_with(&dest) {
        return Err(invalid("新旧保存位置不能互相包含"));
    }
    let stage = parent.join(format!(".mne-migrate-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&stage)?;
    let result = (|| {
        for name in ["Notebooks", "Trash"] { copy(&source.join(name), &stage.join(name))?; }
        // Do not expose partially copied data or replace any existing library.
        if dest.exists() { return Err(invalid("目标位置已存在，迁移已停止")); }
        fs::rename(&stage, &dest)?;
        // If publishing the pointer fails, leave the verified copy available for recovery.
        allow(&dest)?;
        fs::create_dir_all(config)?;
        storage::atomic_write(config.join(FILE), serde_json::to_vec(&dest)?)?;
        Ok(dest)
    })();
    if stage.exists() { let _ = fs::remove_dir_all(stage); }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_preserves_all_data_and_rejects_overwrites_and_nested_paths() {
        let base = std::env::temp_dir().join(format!("mne-location-{}", uuid::Uuid::new_v4()));
        let source = base.join("old"); let folder = base.join("chosen"); let config = base.join("config");
        fs::create_dir_all(source.join("Notebooks/中文/Note/assets")).unwrap();
        fs::create_dir_all(source.join("Notebooks/中文/Note/versions")).unwrap();
        fs::create_dir_all(source.join("Trash/item")).unwrap(); fs::create_dir_all(&folder).unwrap();
        fs::write(source.join("Notebooks/中文/Note/Note.md"), b"# Note\n").unwrap();
        fs::write(source.join("Notebooks/中文/Note/.note.json"), br#"{"icon":"document","colorHex":null}"#).unwrap();
        fs::write(source.join("Notebooks/中文/Note/assets/a.png"), b"png").unwrap();
        fs::write(source.join("Notebooks/中文/Note/versions/1.md"), b"history").unwrap();
        fs::write(source.join("Trash/item/meta.json"), b"trash").unwrap();
        assert!(migrate(&source, source.to_str().unwrap(), &config, |_| Ok(())).is_err());
        let dest = migrate(&source, folder.to_str().unwrap(), &config, |_| Ok(())).unwrap();
        assert_eq!(read_location(&config).unwrap(), dest);
        for name in ["Notebooks/中文/Note/Note.md", "Notebooks/中文/Note/assets/a.png", "Notebooks/中文/Note/versions/1.md", "Trash/item/meta.json"] {
            assert_eq!(fs::read(source.join(name)).unwrap(), fs::read(dest.join(name)).unwrap());
        }
        assert!(migrate(&source, folder.to_str().unwrap(), &config, |_| Ok(())).is_err());
        fs::rename(dest.join("Notebooks"), dest.join("Offline")).unwrap();
        assert!(read_location(&config).is_err());
        assert!(!dest.join("Notebooks").exists());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn failed_scope_update_keeps_the_old_pointer_and_recovery_copy() {
        let base = std::env::temp_dir().join(format!("mne-location-fail-{}", uuid::Uuid::new_v4()));
        let source=base.join("old"); let folder=base.join("chosen"); let config=base.join("config");
        fs::create_dir_all(source.join("Notebooks")).unwrap(); fs::create_dir_all(source.join("Trash")).unwrap(); fs::create_dir_all(&folder).unwrap();
        fs::create_dir_all(&config).unwrap();
        storage::atomic_write(config.join(FILE), serde_json::to_vec(&source).unwrap()).unwrap();
        assert!(migrate(&source, folder.to_str().unwrap(), &config, |_| Err(invalid("scope error"))).is_err());
        assert_eq!(read_location(&config).unwrap(), source);
        assert!(folder.join("MeteorNoteEditor/Notebooks").is_dir());
        assert!(source.join("Notebooks").is_dir());
        fs::remove_dir_all(base).unwrap();
    }
}
