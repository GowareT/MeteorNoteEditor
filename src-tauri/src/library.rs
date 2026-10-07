use crate::models::*;
use regex::Regex;
use std::fs;
use std::io::Read;
use base64::Engine;
use std::path::{Path, PathBuf};

pub fn ensure_roots() -> LibraryResult<()> {
    initialize_notebooks_root(&paths::notebooks_root()?)?;
    fs::create_dir_all(paths::trash_root()?)?;
    Ok(())
}

fn initialize_notebooks_root(root: &Path) -> LibraryResult<()> {
    // An existing empty library is intentional, including after deleting its last notebook.
    if root.exists() { return Ok(()); }
    let parent = root.parent().ok_or_else(|| LibraryError::Message("无效笔记库位置".into()))?;
    fs::create_dir_all(parent)?;
    let stage = parent.join(format!(".mne-initialize-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&stage)?;
    let result = seed_defaults(&stage).and_then(|_| fs::rename(&stage, root).map_err(Into::into));
    if result.is_err() { let _ = fs::remove_dir_all(stage); }
    result
}

#[cfg(test)]
mod deletion_tests {
    use super::*;

    struct TestLibrary(PathBuf);

    impl TestLibrary {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("meteornote-delete-test-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestLibrary {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn deleting_last_notebook_does_not_reseed_library() {
        let temp = TestLibrary::new();
        let root = temp.0.join("Notebooks");
        initialize_notebooks_root(&root).unwrap();
        assert!(!scan_notebooks(&root, None).unwrap().is_empty());
        for entry in fs::read_dir(&root).unwrap() {
            let entry = entry.unwrap();
            if entry.file_type().unwrap().is_dir() { fs::remove_dir_all(entry.path()).unwrap(); }
        }
        initialize_notebooks_root(&root).unwrap();
        assert!(scan_notebooks(&root, None).unwrap().is_empty());
    }

    #[test]
    fn existing_empty_library_stays_empty() {
        let temp = TestLibrary::new();
        initialize_notebooks_root(&temp.0).unwrap();
        assert!(fs::read_dir(&temp.0).unwrap().next().is_none());
    }

    #[test]
    fn first_install_has_complete_ordered_examples_and_never_overwrites_edits() {
        let temp = TestLibrary::new();
        let root = temp.0.join("Notebooks");
        initialize_notebooks_root(&root).unwrap();
        assert_eq!(read_order(&root).notebooks, vec!["开始使用", "工作与计划", "学习与记录"]);
        let start = root.join("开始使用");
        assert_eq!(read_order(&start).notes.len(), 4);
        let image = start.join("图片、公式与资料/assets/editor-logo.png");
        assert!(fs::read(image).unwrap().starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(root.join("工作与计划/项目示例/会议记录/会议记录.md").is_file());
        fn verify(dir: &Path, count: &mut usize) {
            for entry in fs::read_dir(dir).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() { verify(&path, count); }
                else if path.extension().is_some_and(|ext| ext == "md") {
                    let body = fs::read_to_string(&path).unwrap();
                    assert!(body.starts_with(&format!("# {}\n", path.file_stem().unwrap().to_string_lossy())));
                    assert!(body.chars().count() > 200);
                    *count += 1;
                }
            }
        }
        let mut count = 0; verify(&root, &mut count); assert_eq!(count, 9);
        let welcome = start.join("从这里开始/从这里开始.md");
        crate::storage::atomic_write(&welcome, "# 我的内容\n").unwrap();
        initialize_notebooks_root(&root).unwrap();
        assert_eq!(fs::read_to_string(welcome).unwrap(), "# 我的内容\n");
    }

    #[test]
    fn delayed_access_cannot_recreate_trashed_notebook() {
        let temp = TestLibrary::new();
        let notebook = temp.0.join("Notebook");
        let pkg = notebook.join("Child").join("Note");
        fs::create_dir_all(&pkg).unwrap();
        crate::storage::atomic_write(pkg.join("Note.md"), "# Latest draft\n").unwrap();
        ensure_note_package(&pkg).unwrap();
        let payload = temp.0.join("payload");
        fs::rename(&notebook, &payload).unwrap();
        for _ in 0..3 {
            assert!(ensure_note_package(&pkg).is_err());
            assert!(!notebook.exists());
        }
        assert_eq!(fs::read_to_string(payload.join("Child/Note/Note.md")).unwrap(), "# Latest draft\n");
        fs::rename(&payload, &notebook).unwrap();
        ensure_note_package(&pkg).unwrap();
    }

    #[test]
    fn draft_copies_keep_images_and_fail_without_publishing_incomplete_notes() {
        let temp = TestLibrary::new();
        paths::with_test_root(temp.0.clone(), || {
            let book = create_notebook(Some("Book".into()), None).unwrap();
            let note = create_note(&book, Some("Source".into())).unwrap();
            let original = read_note(&note).unwrap();
            let package = paths::notebook_path(&note).unwrap();
            fs::create_dir_all(package.join("assets/nested")).unwrap();
            fs::write(package.join("assets/nested/图.png"), b"image data").unwrap();
            let draft = "# Source\n![图|180|crop=0,0,0.5,1](assets/nested/图.png)\n![参考][ref]\n\n[ref]: assets/nested/图.png\n\n![网络](https://example.com/a.png)\n";
            for title in ["Source 冲突副本", "Source 恢复草稿", "Source 冲突副本"] {
                let copied = copy_note_draft(&note, title, draft).unwrap();
                let body = read_note(&copied).unwrap();
                assert!(body.starts_with(&format!("# {}\n", copied.rsplit('/').next().unwrap())));
                assert!(body.contains("图|180|crop=0,0,0.5,1"));
                assert!(body.contains("https://example.com/a.png"));
                let images: Vec<_> = pulldown_cmark::Parser::new(&body).filter_map(|event| match event {
                    pulldown_cmark::Event::Start(pulldown_cmark::Tag::Image { dest_url, .. }) if !dest_url.starts_with("https:") => Some(dest_url.to_string()),
                    _ => None,
                }).collect();
                assert_eq!(images.len(), 2);
                for image in images { assert_eq!(fs::read(paths::notebook_path(&copied).unwrap().join(image)).unwrap(), b"image data"); }
            }
            assert_eq!(read_note(&note).unwrap(), original);
            assert!(copy_note_draft(&note, "Broken", "# Source\n![lost](assets/missing.png)").is_err());
            assert!(!paths::notebook_path("Book/Broken").unwrap().exists());
            assert!(!fs::read_dir(paths::app_support().unwrap()).unwrap().any(|entry| entry.unwrap().file_name().to_string_lossy().starts_with(".mne-copy-")));
            #[cfg(unix)] {
                std::os::unix::fs::symlink(temp.0.join("outside.png"), package.join("assets/link.png")).unwrap();
                fs::write(temp.0.join("outside.png"), b"outside").unwrap();
                assert!(copy_note_draft(&note, "Unsafe", "![img](assets/link.png)").is_err());
                assert!(!paths::notebook_path("Book/Unsafe").unwrap().exists());
            }
        });
    }

    #[test]
    fn listed_note_dates_use_package_creation_and_markdown_modification() {
        let temp = TestLibrary::new();
        paths::with_test_root(temp.0.clone(), || {
            let book = create_notebook(Some("Dates".into()), None).unwrap();
            let note = create_note(&book, Some("Example".into())).unwrap();
            let before = list_notebooks().unwrap().into_iter().find(|b| b.id == book).unwrap().notes.remove(0);
            write_note(&note, "# Example\nupdated content").unwrap();
            let changed = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
            let file = fs::OpenOptions::new().write(true).open(note_markdown_url(&note).unwrap()).unwrap();
            file.set_times(fs::FileTimes::new().set_modified(changed)).unwrap();
            drop(file);
            let after = list_notebooks().unwrap().into_iter().find(|b| b.id == book).unwrap().notes.remove(0);
            assert_eq!(after.created_at, before.created_at);
            assert_eq!(after.created_at, file_created_at(&note_package_url(&note).unwrap()).map(|date| date.to_rfc3339()));
            assert_eq!(after.modified_at.as_deref(), Some("2023-11-14T22:13:20+00:00"));
            let json = serde_json::to_value(after).unwrap();
            assert!(json["modifiedAt"].is_string());
            assert!(json.get("createdAt").is_some());
        });
    }

    fn legacy_trash_meta() -> TrashMeta {
        serde_json::from_value(serde_json::json!({
            "id": "test", "kind": "note", "originalPath": "Notebook/Note",
            "title": "Note", "trashedAt": "2026-10-07T12:00:00Z"
        })).unwrap()
    }

    #[test]
    fn trash_dates_preserve_saved_creation_time_for_notes_and_notebooks() {
        let temp = TestLibrary::new();
        for kind in ["note", "notebook"] {
            let mut meta = legacy_trash_meta();
            meta.kind = kind.into();
            meta.created_at = Some("2025-03-01T08:09:10Z".parse().unwrap());
            let json = serde_json::to_value(&meta).unwrap();
            assert_eq!(json["createdAt"], "2025-03-01T08:09:10Z");
            let restored: TrashMeta = serde_json::from_value(json).unwrap();
            let item = trash_item_from_meta(restored, &temp.0);
            assert_eq!(item.created_at.as_deref(), Some("2025-03-01T08:09:10+00:00"));
            assert_eq!(item.trashed_at, "2026-10-07T12:00:00+00:00");
            let response = serde_json::to_value(&item).unwrap();
            assert!(response["createdAt"].is_string());
            assert!(response["trashedAt"].is_string());
        }
    }

    #[test]
    fn legacy_trash_dates_use_valid_birth_time_or_remain_unknown() {
        let temp = TestLibrary::new();
        let meta = legacy_trash_meta();
        assert!(meta.created_at.is_none());
        assert!(trash_item_from_meta(meta, &temp.0.join("missing")).created_at.is_none());

        let Some(created) = file_created_at(&temp.0) else { return };
        let mut meta = legacy_trash_meta();
        meta.trashed_at = created + chrono::Duration::seconds(1);
        assert_eq!(trash_item_from_meta(meta, &temp.0).created_at, Some(created.to_rfc3339()));

        let mut meta = legacy_trash_meta();
        meta.trashed_at = created - chrono::Duration::seconds(1);
        assert!(trash_item_from_meta(meta, &temp.0).created_at.is_none());
    }

    #[test]
    fn standalone_library_roundtrip() {
        let temp = TestLibrary::new();
        paths::with_test_root(temp.0.clone(), || {
            let root = create_notebook(Some("Root".into()), None).unwrap();
            let child = create_notebook(Some("Child".into()), Some(root.clone())).unwrap();
            let note = create_note(&child, Some("Example".into())).unwrap();
            let body = "# Example\n\n- [ ] Task\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";
            write_note(&note, body).unwrap();
            assert_eq!(read_note(&note).unwrap(), body);
            assert!(!paths::notebook_path(&note).unwrap().join("canvas.json").exists());
            assert!(!paths::notebook_path(&note).unwrap().join("ai-chat.json").exists());
            let renamed = rename_note(&note, "Renamed").unwrap();
            assert!(read_note(&renamed).unwrap().starts_with("# Renamed\n"));
            let moved = move_note(&renamed, &root).unwrap();
            assert!(!list_note_versions(&moved).unwrap().is_empty());
            move_note_to_trash(&moved).unwrap();
            let trash = list_trash().unwrap();
            assert_eq!(trash.len(), 1);
            assert_eq!(trash[0].original_path, moved);
            assert!(trash[0].created_at.is_some());
            assert!(read_note(&moved).is_err());
            restore_trash_item(&trash[0].id).unwrap();
            assert!(read_note(&moved).unwrap().contains("- [ ] Task"));
            assert!(list_trash().unwrap().is_empty());
            move_notebook_to_trash(&root).unwrap();
            let trash = list_trash().unwrap();
            assert_eq!(trash[0].kind, "notebook");
            restore_trash_item(&trash[0].id).unwrap();
            assert!(read_note(&moved).is_ok());
            move_notebook_to_trash(&root).unwrap();
            permanently_delete_trash_item(&list_trash().unwrap()[0].id).unwrap();
            assert!(list_trash().unwrap().is_empty());
            assert!(!paths::notebook_path(&root).unwrap().exists());
        });
    }

    #[test]
    fn standalone_paths_are_isolated_and_reject_traversal() {
        assert_eq!(paths::app_support().unwrap().file_name().unwrap(), "MeteorNoteEditor");
        let temp = TestLibrary::new();
        paths::with_test_root(temp.0.clone(), || {
            assert!(read_note("../outside").is_err());
            assert!(move_notebook_to_trash("/tmp").is_err());
            assert!(permanently_delete_trash_item("../outside").is_err());
            assert!(create_notebook(Some("../outside".into()), None).is_err());
            let root = create_notebook(Some("Root".into()), None).unwrap();
            assert!(create_note(&root, Some("../outside".into())).is_err());
            #[cfg(unix)] {
                let link = paths::notebooks_root().unwrap().join("Linked");
                std::os::unix::fs::symlink(&temp.0, &link).unwrap();
                assert!(paths::notebook_path("Linked/Note").is_err());
            }
        });
    }
}

fn seed_defaults(root: &Path) -> LibraryResult<()> {
    let samples = [
        ("开始使用", "从这里开始", include_str!("../default-notes/welcome.md")),
        ("开始使用", "编辑与排版示例", include_str!("../default-notes/writing.md")),
        ("开始使用", "图片、公式与资料", include_str!("../default-notes/media.md")),
        ("开始使用", "保存、导入与备份", include_str!("../default-notes/storage.md")),
        ("工作与计划", "每周计划", include_str!("../default-notes/weekly.md")),
        ("工作与计划/项目示例", "项目简报", include_str!("../default-notes/project.md")),
        ("工作与计划/项目示例", "会议记录", include_str!("../default-notes/meeting.md")),
        ("学习与记录", "阅读笔记", include_str!("../default-notes/reading.md")),
        ("学习与记录", "每日复盘", include_str!("../default-notes/review.md")),
    ];
    for (nb, note_title, body) in samples {
        let mut nb_dir = root.to_path_buf();
        for part in nb.split('/') {
            let mut order = read_order(&nb_dir);
            append_order_item(&mut order.notebooks, part);
            write_order(&nb_dir, &order)?;
            nb_dir.push(part);
            fs::create_dir_all(&nb_dir)?;
            write_meta(&nb_dir, &NotebookMeta { icon: "folder.fill".into(), color_hex: None })?;
        }
        let pkg = nb_dir.join(note_title);
        fs::create_dir_all(&pkg)?;
        crate::storage::atomic_write(pkg.join(format!("{note_title}.md")), body)?;
        ensure_note_package(&pkg)?;
        let mut order = read_order(&nb_dir);
        append_order_item(&mut order.notes, note_title);
        write_order(&nb_dir, &order)?;
        if note_title == "图片、公式与资料" {
            fs::create_dir_all(pkg.join("assets"))?;
            crate::storage::atomic_write(pkg.join("assets/editor-logo.png"), include_bytes!("../../public/logo.png"))?;
        }
    }
    Ok(())
}

fn write_meta(dir: &Path, meta: &NotebookMeta) -> LibraryResult<()> {
    let data = serde_json::to_vec_pretty(meta)?;
    crate::storage::atomic_write(dir.join(".notebook.json"), data)?;
    Ok(())
}

fn read_meta(dir: &Path) -> NotebookMeta {
    let path = dir.join(".notebook.json");
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(NotebookMeta {
            icon: "folder.fill".into(),
            color_hex: None,
        })
}

fn read_order(dir: &Path) -> OrderFile {
    let path = dir.join(".order.json");
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_order(dir: &Path, order: &OrderFile) -> LibraryResult<()> {
    fs::create_dir_all(dir)?;
    crate::storage::atomic_write(dir.join(".order.json"), serde_json::to_vec_pretty(order)?)?;
    Ok(())
}

fn append_order_item(list: &mut Vec<String>, item: &str) {
    list.retain(|x| x != item);
    list.push(item.to_string());
}

fn rename_order_item(list: &mut Vec<String>, old: &str, new: &str) {
    for item in list.iter_mut() {
      if item == old {
        *item = new.to_string();
      }
    }
}

fn remove_order_item(list: &mut Vec<String>, item: &str) {
    list.retain(|x| x != item);
}

fn is_note_package(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name.starts_with('.') {
        return false;
    }
    path.join(format!("{name}.md")).exists()
}

pub fn list_notebooks() -> LibraryResult<Vec<LibraryNotebook>> {
    ensure_roots()?;
    scan_notebooks(&paths::notebooks_root()?, None)
}

fn scan_notebooks(dir: &Path, parent: Option<String>) -> LibraryResult<Vec<LibraryNotebook>> {
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .filter(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            !name.starts_with('.') && !is_note_package(p)
        })
        .collect();

    let order = read_order(dir);
    sort_by_order(&mut entries, &order.notebooks);

    let mut result = Vec::new();
    for path in entries {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("untitled")
            .to_string();
        let id = match &parent {
            Some(p) => format!("{p}/{name}"),
            None => name.clone(),
        };
        let meta = read_meta(&path);
        let notes = scan_notes(&path, &id)?;
        let children = scan_notebooks(&path, Some(id.clone()))?;
        result.push(LibraryNotebook {
            id,
            name,
            parent_path: parent.clone(),
            icon: meta.icon,
            color_hex: meta.color_hex,
            notes,
            children,
        });
    }
    Ok(result)
}

fn read_note_meta(pkg: &Path) -> NoteMeta {
    let path = pkg.join(".note.json");
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(NoteMeta {
            icon: "document".into(),
            color_hex: None,
        })
}

fn write_note_meta(pkg: &Path, meta: &NoteMeta) -> LibraryResult<()> {
    let data = serde_json::to_vec_pretty(meta)?;
    crate::storage::atomic_write(pkg.join(".note.json"), data)?;
    Ok(())
}

fn scan_notes(dir: &Path, notebook_path: &str) -> LibraryResult<Vec<LibraryNote>> {
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| is_note_package(p))
        .collect();
    let order = read_order(dir);
    sort_by_order(&mut entries, &order.notes);

    let mut notes = Vec::new();
    for path in entries {
        let title = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("untitled")
            .to_string();
        let meta = read_note_meta(&path);
        let modified_at = fs::metadata(path.join(format!("{title}.md"))).ok()
            .and_then(|meta| meta.modified().ok())
            .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339());
        notes.push(LibraryNote {
            id: format!("{notebook_path}/{title}"),
            title,
            notebook_path: notebook_path.to_string(),
            icon: meta.icon,
            color_hex: meta.color_hex,
            created_at: file_created_at(&path).map(|time| time.to_rfc3339()),
            modified_at,
        });
    }
    Ok(notes)
}

fn sort_by_order(entries: &mut [PathBuf], ordered: &[String]) {
    entries.sort_by_key(|p| {
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        ordered
            .iter()
            .position(|n| n == &name)
            .unwrap_or(usize::MAX)
    });
}

fn note_package_url(note_path: &str) -> LibraryResult<PathBuf> {
    Ok(paths::notebook_path(note_path)?)
}

fn note_markdown_url(note_path: &str) -> LibraryResult<PathBuf> {
    let pkg = note_package_url(note_path)?;
    let title = pkg
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("note")
        .to_string();
    Ok(pkg.join(format!("{title}.md")))
}

fn ensure_note_package(pkg: &Path) -> LibraryResult<()> {
    if !is_note_package(pkg) {
        return Err(LibraryError::Message("笔记不存在或已移到回收站".into()));
    }
    // Never recreate missing ancestors from delayed editor writes.
    for name in ["assets", "versions"] {
        let dir = pkg.join(name);
        match fs::create_dir(&dir) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists && dir.is_dir() => {}
            Err(error) => return Err(error.into()),
        }
    }
    let note_meta = pkg.join(".note.json");
    if !note_meta.exists() {
        write_note_meta(
            pkg,
            &NoteMeta {
                icon: "document".into(),
                color_hex: None,
            },
        )?;
    }
    Ok(())
}

pub fn set_notebook_icon(path: &str, icon: &str) -> LibraryResult<()> {
    ensure_roots()?;
    let icon = icon.trim();
    if icon.is_empty() {
        return Err(LibraryError::Message("图标不能为空".into()));
    }
    let dir = paths::notebook_path(path)?;
    if !dir.is_dir() || is_note_package(&dir) {
        return Err(LibraryError::Message("笔记本不存在".into()));
    }
    let mut meta = read_meta(&dir);
    meta.icon = icon.to_string();
    write_meta(&dir, &meta)?;
    Ok(())
}

pub fn set_notebook_color(path: &str, color_hex: Option<&str>) -> LibraryResult<()> {
    ensure_roots()?;
    let dir = paths::notebook_path(path)?;
    if !dir.is_dir() || is_note_package(&dir) {
        return Err(LibraryError::Message("笔记本不存在".into()));
    }
    let mut meta = read_meta(&dir);
    meta.color_hex = color_hex
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    write_meta(&dir, &meta)?;
    Ok(())
}

pub fn set_notebook_appearance(
    path: &str,
    icon: &str,
    color_hex: Option<&str>,
) -> LibraryResult<()> {
    ensure_roots()?;
    let icon = icon.trim();
    if icon.is_empty() {
        return Err(LibraryError::Message("图标不能为空".into()));
    }
    let dir = paths::notebook_path(path)?;
    if !dir.is_dir() || is_note_package(&dir) {
        return Err(LibraryError::Message("笔记本不存在".into()));
    }
    let mut meta = read_meta(&dir);
    meta.icon = icon.to_string();
    meta.color_hex = color_hex
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    write_meta(&dir, &meta)?;
    Ok(())
}

pub fn set_note_icon(path: &str, icon: &str) -> LibraryResult<()> {
    ensure_roots()?;
    let icon = icon.trim();
    if icon.is_empty() {
        return Err(LibraryError::Message("图标不能为空".into()));
    }
    let pkg = note_package_url(path)?;
    if !is_note_package(&pkg) {
        return Err(LibraryError::Message("笔记不存在".into()));
    }
    ensure_note_package(&pkg)?;
    let mut meta = read_note_meta(&pkg);
    meta.icon = icon.to_string();
    write_note_meta(
        &pkg,
        &meta,
    )?;
    Ok(())
}

pub fn set_note_color(path: &str, color_hex: Option<&str>) -> LibraryResult<()> {
    ensure_roots()?;
    let pkg = note_package_url(path)?;
    if !is_note_package(&pkg) {
        return Err(LibraryError::Message("笔记不存在".into()));
    }
    ensure_note_package(&pkg)?;
    let mut meta = read_note_meta(&pkg);
    meta.color_hex = color_hex
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    write_note_meta(&pkg, &meta)?;
    Ok(())
}

pub fn set_note_appearance(
    path: &str,
    icon: &str,
    color_hex: Option<&str>,
) -> LibraryResult<()> {
    ensure_roots()?;
    let icon = icon.trim();
    if icon.is_empty() {
        return Err(LibraryError::Message("图标不能为空".into()));
    }
    let pkg = note_package_url(path)?;
    if !is_note_package(&pkg) {
        return Err(LibraryError::Message("笔记不存在".into()));
    }
    ensure_note_package(&pkg)?;
    let mut meta = read_note_meta(&pkg);
    meta.icon = icon.to_string();
    meta.color_hex = color_hex
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    write_note_meta(&pkg, &meta)?;
    Ok(())
}

pub fn read_note(path: &str) -> LibraryResult<String> {
    let pkg = note_package_url(path)?;
    ensure_note_package(&pkg)?;
    let url = note_markdown_url(path)?;
    Ok(fs::read_to_string(url)?)
}

const MAX_NOTE_VERSIONS: usize = 40;
const VERSION_COALESCE_SECS: u64 = 90;

fn snapshot_note_before_write(pkg: &Path, md_path: &Path, next: &str) -> LibraryResult<()> {
    if !md_path.exists() {
        return Ok(());
    }
    let prev = fs::read_to_string(md_path)?;
    if prev == next || prev.trim() == next.trim() {
        return Ok(());
    }
    let versions = pkg.join("versions");
    if !versions.is_dir() {
        fs::create_dir(&versions)?;
    }

    // 短时间内多次自动保存合并为同一快照，避免版本爆炸
    if let Some(latest) = newest_version_file(&versions)? {
        if let Ok(meta) = latest.metadata() {
            if let Ok(modified) = meta.modified() {
                if let Ok(age) = modified.elapsed() {
                    if age.as_secs() < VERSION_COALESCE_SECS {
                        crate::storage::atomic_write(&latest, &prev)?;
                        return Ok(());
                    }
                }
            }
        }
    }

    let id = format!("v-{}.md", chrono::Local::now().format("%Y%m%d-%H%M%S-%3f"));
    crate::storage::atomic_write(versions.join(id), &prev)?;
    prune_note_versions(&versions)?;
    Ok(())
}

fn newest_version_file(versions: &Path) -> LibraryResult<Option<PathBuf>> {
    let mut files: Vec<_> = fs::read_dir(versions)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        })
        .collect();
    files.sort_by_key(|e| e.file_name());
    Ok(files.pop().map(|e| e.path()))
}

fn prune_note_versions(versions: &Path) -> LibraryResult<()> {
    let mut files: Vec<_> = fs::read_dir(versions)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        })
        .collect();
    files.sort_by_key(|e| e.file_name());
    while files.len() > MAX_NOTE_VERSIONS {
        if let Some(oldest) = files.first() {
            let _ = fs::remove_file(oldest.path());
        }
        files.remove(0);
    }
    Ok(())
}

fn version_preview(content: &str) -> String {
    let flat = content
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .unwrap_or("(空)")
        .chars()
        .take(80)
        .collect::<String>();
    flat
}

pub fn write_note(path: &str, content: &str) -> LibraryResult<()> {
    let pkg = note_package_url(path)?;
    ensure_note_package(&pkg)?;
    let url = note_markdown_url(path)?;
    snapshot_note_before_write(&pkg, &url, content)?;
    crate::storage::atomic_write(url, content)?;
    Ok(())
}

pub fn store_note_asset(note_path: &str, source_path: &str) -> LibraryResult<String> {
    ensure_roots()?;
    let pkg = note_package_url(note_path)?;
    store_note_asset_in_package(&pkg, source_path)
}

fn unique_destination(dir: &Path, preferred_name: &str) -> PathBuf {
    let candidate = dir.join(preferred_name);
    if !candidate.exists() { return candidate; }
    let path = Path::new(preferred_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(preferred_name);
    let ext = path.extension().and_then(|e| e.to_str()).map(|e| format!(".{e}")).unwrap_or_default();
    let mut i = 2usize;
    loop {
        let next = dir.join(format!("{stem} ({i}){ext}"));
        if !next.exists() { return next; }
        i += 1;
    }
}

fn store_note_asset_in_package(pkg: &Path, source_path: &str) -> LibraryResult<String> {
    ensure_note_package(&pkg)?;
    let source = source_path.trim();
    const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
    let (bytes, file_name) = if source.starts_with("data:") {
        let (header, data) = source.split_once(',')
            .ok_or_else(|| LibraryError::Message("图片数据无效".into()))?;
        if !header.starts_with("data:image/") || !header.ends_with(";base64") || data.len() > MAX_IMAGE_BYTES * 4 / 3 + 4 {
            return Err(LibraryError::Message("图片格式无效或超过 20MB".into()));
        }
        let bytes = base64::engine::general_purpose::STANDARD.decode(data)
            .map_err(|_| LibraryError::Message("图片数据无效".into()))?;
        let extension = image_extension(&bytes)?;
        (bytes, format!("image.{extension}"))
    } else if source.starts_with("https://") || source.starts_with("http://") {
        let response = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(20)).build()
            .get(source).call().map_err(|e| LibraryError::Message(format!("图片下载失败: {e}")))?;
        let mut bytes = Vec::new();
        response.into_reader().take((MAX_IMAGE_BYTES + 1) as u64).read_to_end(&mut bytes)?;
        let extension = image_extension(&bytes)?;
        (bytes, format!("image.{extension}"))
    } else {
        let src = Path::new(source);
        if !src.is_file() { return Err(LibraryError::Message("图片源文件不存在".into())); }
        if src.metadata()?.len() > MAX_IMAGE_BYTES as u64 { return Err(LibraryError::Message("图片不能超过 20MB".into())); }
        let bytes = fs::read(src)?;
        image_extension(&bytes)?;
        (bytes, src.file_name().and_then(|n| n.to_str()).unwrap_or("image").to_string())
    };
    if bytes.len() > MAX_IMAGE_BYTES { return Err(LibraryError::Message("图片不能超过 20MB".into())); }
    let assets = pkg.join("assets");
    let dest = unique_destination(&assets, &file_name);
    crate::storage::atomic_write(&dest, bytes)?;
    let saved_name = dest
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&file_name);
    Ok(format!("assets/{saved_name}"))
}

fn image_extension(bytes: &[u8]) -> LibraryResult<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { return Ok("png"); }
    if bytes.starts_with(b"\xff\xd8\xff") { return Ok("jpg"); }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") { return Ok("gif"); }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") { return Ok("webp"); }
    if bytes.starts_with(b"BM") { return Ok("bmp"); }
    if std::str::from_utf8(bytes).ok().is_some_and(|s| s.trim_start().starts_with("<svg") || (s.trim_start().starts_with("<?xml") && s.contains("<svg"))) { return Ok("svg"); }
    Err(LibraryError::Message("不是支持的图片文件".into()))
}

#[cfg(test)]
mod image_tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn local_data_and_http_images_are_stored_as_assets() {
        let root = std::env::temp_dir().join(format!("mn-images-{}", uuid::Uuid::new_v4()));
        let pkg = root.join("note");
        fs::create_dir_all(&pkg).unwrap();
        crate::storage::atomic_write(pkg.join("note.md"), "# note\n").unwrap();
        let bytes = b"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\"><rect width=\"20\" height=\"20\"/></svg>";
        let file = root.join("local image.svg");
        crate::storage::atomic_write(&file, bytes).unwrap();
        let local = store_note_asset_in_package(&pkg, file.to_str().unwrap()).unwrap();
        assert!(local.starts_with("assets/"));
        assert_eq!(fs::read(pkg.join(&local)).unwrap(), bytes);
        let data = format!("data:image/svg+xml;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes));
        let uploaded = store_note_asset_in_package(&pkg, &data).unwrap();
        assert_eq!(fs::read(pkg.join(uploaded)).unwrap(), bytes);
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/test.svg", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 2048]; stream.read(&mut request).unwrap();
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: image/svg+xml\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", bytes.len()).unwrap();
            stream.write_all(bytes).unwrap();
        });
        let downloaded = store_note_asset_in_package(&pkg, &url).unwrap();
        server.join().unwrap();
        assert_eq!(fs::read(pkg.join(downloaded)).unwrap(), bytes);
        assert!(store_note_asset_in_package(&pkg, "data:image/png;base64,bm90LWltYWdl").is_err());
        assert!(store_note_asset_in_package(&pkg, "/missing/image.png").is_err());
        fs::remove_dir_all(root).unwrap();
    }
}

pub fn list_note_versions(path: &str) -> LibraryResult<Vec<NoteVersionInfo>> {
    let pkg = note_package_url(path)?;
    ensure_note_package(&pkg)?;
    let versions = pkg.join("versions");
    let mut out: Vec<NoteVersionInfo> = Vec::new();
    let mut files: Vec<_> = fs::read_dir(&versions)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        })
        .collect();
    files.sort_by_key(|e| std::cmp::Reverse(e.file_name()));
    for entry in files {
        let name = entry.file_name().to_string_lossy().to_string();
        let meta = entry.metadata()?;
        let body = fs::read_to_string(entry.path()).unwrap_or_default();
        let created_at = meta
            .modified()
            .ok()
            .map(|t| {
                let dt: chrono::DateTime<chrono::Local> = t.into();
                dt.format("%Y-%m-%d %H:%M:%S").to_string()
            })
            .unwrap_or_else(|| name.clone());
        out.push(NoteVersionInfo {
            id: name.trim_end_matches(".md").to_string(),
            created_at,
            size: meta.len(),
            preview: version_preview(&body),
        });
    }
    Ok(out)
}

pub fn read_note_version(path: &str, version_id: &str) -> LibraryResult<String> {
    let pkg = note_package_url(path)?;
    let id = version_id.trim().trim_end_matches(".md");
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err(LibraryError::Message("无效的版本 id".into()));
    }
    let file = pkg.join("versions").join(format!("{id}.md"));
    if !file.is_file() {
        return Err(LibraryError::Message("版本不存在".into()));
    }
    Ok(fs::read_to_string(file)?)
}

pub fn restore_note_version(path: &str, version_id: &str) -> LibraryResult<String> {
    let content = read_note_version(path, version_id)?;
    write_note(path, &content)?;
    Ok(content)
}

pub fn create_notebook(
    preferred_name: Option<String>,
    parent_path: Option<String>,
) -> LibraryResult<String> {
    ensure_roots()?;
    let base = preferred_name
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| "新建笔记本".into());
    validate_name(&base)?;
    let parent_dir = match &parent_path {
        Some(p) if !p.is_empty() => paths::notebook_path(p)?,
        _ => paths::notebooks_root()?,
    };
    fs::create_dir_all(&parent_dir)?;
    let mut name = base.clone();
    let mut i = 2;
    while parent_dir.join(&name).exists() {
        name = format!("{base} {i}");
        i += 1;
    }
    let dir = parent_dir.join(&name);
    fs::create_dir_all(&dir)?;
    write_meta(
        &dir,
        &NotebookMeta {
            icon: "folder.fill".into(),
            color_hex: None,
        },
    )?;
    let mut order = read_order(&parent_dir);
    append_order_item(&mut order.notebooks, &name);
    write_order(&parent_dir, &order)?;
    Ok(match parent_path {
        Some(p) if !p.is_empty() => format!("{p}/{name}"),
        _ => name,
    })
}

pub fn create_note(notebook_path: &str, title: Option<String>) -> LibraryResult<String> {
    ensure_roots()?;
    let title = title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| "未命名笔记".into());
    validate_name(&title)?;
    let nb_dir = paths::notebook_path(notebook_path)?;
    fs::create_dir_all(&nb_dir)?;
    if !nb_dir.join(".notebook.json").exists() {
        write_meta(
            &nb_dir,
            &NotebookMeta {
                icon: "folder.fill".into(),
                color_hex: None,
            },
        )?;
    }
    let mut final_title = title.clone();
    let mut i = 2;
    while nb_dir.join(&final_title).exists() {
        final_title = format!("{title} {i}");
        i += 1;
    }
    let pkg = nb_dir.join(&final_title);
    fs::create_dir_all(&pkg)?;
    crate::storage::atomic_write(
        pkg.join(format!("{final_title}.md")),
        format!("# {final_title}\n"),
    )?;
    ensure_note_package(&pkg)?;
    let mut order = read_order(&nb_dir);
    append_order_item(&mut order.notes, &final_title);
    write_order(&nb_dir, &order)?;
    Ok(format!("{notebook_path}/{final_title}"))
}

/// Build the complete copy before publishing it, so failed attachment copies never
/// discard a recoverable draft or leave a partially populated note behind.
pub fn copy_note_draft(source: &str, title: &str, content: &str) -> LibraryResult<String> {
    ensure_roots()?;
    validate_name(title)?;
    let source_pkg = note_package_url(source)?;
    let parent = parent_rel_path(source).ok_or_else(|| LibraryError::Message("笔记路径缺少笔记本".into()))?;
    let nb_dir = paths::notebook_path(&parent)?;
    let stage = paths::app_support()?.join(format!(".mne-copy-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&stage)?;
    let result = (|| {
        let mut size = content.len() as u64;
        if size > 256 * 1024 * 1024 { return Err(LibraryError::Message("单次操作最多支持 256 MB".into())); }
        let allowed = source_pkg.canonicalize().unwrap_or(source_pkg.clone());
        let body = crate::transfer::import_images(content, &allowed.join("draft.md"), &allowed, &stage, &mut size)?;
        let mut name = title.trim().to_string();
        let mut index = 2;
        while nb_dir.join(&name).exists() { name = format!("{} {index}", title.trim()); index += 1; }
        // Use a note-shaped staging directory for the existing package validator.
        let package = stage.join(&name);
        fs::create_dir(&package)?;
        if stage.join("assets").exists() { fs::rename(stage.join("assets"), package.join("assets"))?; }
        let md = package.join(format!("{name}.md"));
        crate::storage::atomic_write(&md, body)?;
        sync_leading_heading(&md, &name);
        ensure_note_package(&package)?;
        fs::create_dir_all(&nb_dir)?;
        if !nb_dir.join(".notebook.json").exists() {
            write_meta(&nb_dir, &NotebookMeta { icon: "folder.fill".into(), color_hex: None })?;
        }
        let dest = nb_dir.join(&name);
        fs::rename(&package, &dest)?;
        let mut order = read_order(&nb_dir);
        append_order_item(&mut order.notes, &name);
        if let Err(error) = write_order(&nb_dir, &order) { let _ = fs::remove_dir_all(&dest); return Err(error); }
        Ok(format!("{parent}/{name}"))
    })();
    let _ = fs::remove_dir_all(&stage);
    result
}

fn validate_name(name: &str) -> LibraryResult<()> {
    if cfg!(windows) && !valid_windows_name(name) {
        return Err(LibraryError::Message("名称包含 Windows 不支持的字符、保留名称或结尾空格/句点".into()));
    }
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(LibraryError::Message("名称不能为空".into()));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains(':') {
        return Err(LibraryError::Message("名称包含非法字符".into()));
    }
    if trimmed.starts_with('.') {
        return Err(LibraryError::Message("名称不能以 . 开头".into()));
    }
    Ok(())
}

fn parent_rel_path(path: &str) -> Option<String> {
    path.rsplit_once('/').map(|(p, _)| p.to_string())
}

fn rewrite_note_path(old: &str, new_title: &str) -> String {
    match parent_rel_path(old) {
        Some(p) => format!("{p}/{new_title}"),
        None => new_title.to_string(),
    }
}

fn rewrite_notebook_path(old: &str, new_name: &str) -> String {
    match parent_rel_path(old) {
        Some(p) => format!("{p}/{new_name}"),
        None => new_name.to_string(),
    }
}

fn wrap_if_full(text: &str, prefix: &str, suffix: &str, title: &str) -> Option<String> {
    if text.starts_with(prefix)
        && text.ends_with(suffix)
        && text.len() >= prefix.len() + suffix.len()
    {
        return Some(format!("{prefix}{title}{suffix}"));
    }
    None
}

fn replace_heading_inline_text(text: &str, title: &str) -> String {
    let safe = {
        let t = title.trim();
        if t.is_empty() {
            "未命名笔记"
        } else {
            t
        }
    };
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return safe.to_string();
    }
    let leading_len = text.find(trimmed).unwrap_or(0);
    let trailing_start = leading_len + trimmed.len();
    let leading = &text[..leading_len];
    let trailing = &text[trailing_start..];

    let replaced = wrap_if_full(trimmed, "**", "**", safe)
        .or_else(|| wrap_if_full(trimmed, "__", "__", safe))
        .or_else(|| wrap_if_full(trimmed, "~~", "~~", safe))
        .or_else(|| wrap_if_full(trimmed, "`", "`", safe))
        .or_else(|| wrap_if_full(trimmed, "<u>", "</u>", safe));
    if let Some(inner) = replaced {
        return format!("{leading}{inner}{trailing}");
    }

    if trimmed.starts_with('*')
        && trimmed.ends_with('*')
        && !trimmed.starts_with("**")
        && !trimmed.ends_with("**")
    {
        return format!("{leading}*{safe}*{trailing}");
    }
    if trimmed.starts_with('_')
        && trimmed.ends_with('_')
        && !trimmed.starts_with("__")
        && !trimmed.ends_with("__")
    {
        return format!("{leading}_{safe}_{trailing}");
    }

    if let Ok(mark_re) = Regex::new(r"(?is)^<mark([^>]*)>.*</mark>$") {
        if let Some(caps) = mark_re.captures(trimmed) {
            let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            return format!("{leading}<mark{attrs}>{safe}</mark>{trailing}");
        }
    }
    if let Ok(span_re) = Regex::new(r"(?is)^<span([^>]*)>.*</span>$") {
        if let Some(caps) = span_re.captures(trimmed) {
            let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            return format!("{leading}<span{attrs}>{safe}</span>{trailing}");
        }
    }

    format!("{leading}{safe}{trailing}")
}

fn sync_leading_heading(md_path: &Path, new_title: &str) {
    let Ok(content) = fs::read_to_string(md_path) else {
        return;
    };
    let normalized = content.replace("\r\n", "\n");
    let first_line = normalized.split('\n').next().unwrap_or("");
    if first_line.starts_with("# ") {
        let current = &first_line[2..];
        let next_title = replace_heading_inline_text(current, new_title);
        let next = format!("# {next_title}{}", &normalized[first_line.len()..]);
        let _ = crate::storage::atomic_write(md_path, next);
        return;
    }
    if normalized.trim().is_empty() {
        let _ = crate::storage::atomic_write(md_path, format!("# {new_title}\n"));
    } else {
        let next = format!("# {new_title}\n{}", normalized.trim_start_matches('\n'));
        let _ = crate::storage::atomic_write(md_path, next);
    }
}

/// 返回新路径
pub fn rename_note(path: &str, new_title: &str) -> LibraryResult<String> {
    ensure_roots()?;
    validate_name(new_title)?;
    let new_title = new_title.trim();
    let source = note_package_url(path)?;
    if !source.exists() {
        return Err(LibraryError::Message("笔记不存在".into()));
    }
    let old_title = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    if old_title == new_title {
        return Ok(path.to_string());
    }
    let parent = source
        .parent()
        .ok_or_else(|| LibraryError::Message("无效路径".into()))?;
    let dest = parent.join(new_title);
    if dest.exists() {
        return Err(LibraryError::Message("同一笔记本下已存在同名笔记".into()));
    }
    fs::rename(&source, &dest)?;
    let old_md = dest.join(format!("{old_title}.md"));
    let new_md = dest.join(format!("{new_title}.md"));
    if old_md.exists() && old_md != new_md {
        if new_md.exists() {
            let _ = fs::remove_file(&new_md);
        }
        fs::rename(&old_md, &new_md)?;
    }
    sync_leading_heading(&new_md, new_title);
    if let Some(parent_dir) = source.parent() {
        let mut order = read_order(parent_dir);
        rename_order_item(&mut order.notes, &old_title, new_title);
        write_order(parent_dir, &order)?;
    }
    Ok(rewrite_note_path(path, new_title))
}

/// 返回新路径
pub fn rename_notebook(path: &str, new_name: &str) -> LibraryResult<String> {
    ensure_roots()?;
    validate_name(new_name)?;
    let new_name = new_name.trim();
    let source = paths::notebook_path(path)?;
    if !source.is_dir() {
        return Err(LibraryError::Message("笔记本不存在".into()));
    }
    let old_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    if old_name == new_name {
        return Ok(path.to_string());
    }
    let parent = source
        .parent()
        .ok_or_else(|| LibraryError::Message("无效路径".into()))?;
    let dest = parent.join(new_name);
    if dest.exists() {
        return Err(LibraryError::Message("同一级别下已存在同名笔记本".into()));
    }
    fs::rename(&source, &dest)?;
    if let Some(parent_dir) = source.parent() {
        let mut order = read_order(parent_dir);
        rename_order_item(&mut order.notebooks, &old_name, new_name);
        write_order(parent_dir, &order)?;
    }
    Ok(rewrite_notebook_path(path, new_name))
}

pub fn move_notebook(
    path: &str,
    to_parent_path: Option<&str>,
    before_notebook_path: Option<&str>,
) -> LibraryResult<String> {
    ensure_roots()?;
    let source = paths::notebook_path(path)?;
    if !source.is_dir() {
        return Err(LibraryError::Message("笔记本不存在".into()));
    }
    let old_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let old_parent_dir = source
        .parent()
        .ok_or_else(|| LibraryError::Message("无效路径".into()))?;
    let dest_parent_dir = match to_parent_path.map(str::trim).filter(|s| !s.is_empty()) {
        Some(parent) => paths::notebook_path(parent)?,
        None => paths::notebooks_root()?,
    };
    if let Some(parent) = to_parent_path.map(str::trim).filter(|s| !s.is_empty()) {
        if parent == path || parent.starts_with(&format!("{path}/")) {
            return Err(LibraryError::Message("不能移动到自身或子笔记本下".into()));
        }
    }
    if !dest_parent_dir.is_dir() {
        return Err(LibraryError::Message("目标笔记本不存在".into()));
    }
    let before_name = before_notebook_path.map(|p| {
        p.rsplit_once('/')
            .map(|(_, tail)| tail.to_string())
            .unwrap_or_else(|| p.to_string())
    });

    let mut final_name = old_name.clone();
    let mut i = 2;
    while dest_parent_dir.join(&final_name).exists()
        && !(dest_parent_dir == old_parent_dir && dest_parent_dir.join(&final_name) == source)
    {
        final_name = format!("{old_name} {i}");
        i += 1;
    }
    let dest = dest_parent_dir.join(&final_name);
    if source != dest {
        fs::rename(&source, &dest)?;
    }

    let mut source_order = read_order(old_parent_dir);
    remove_order_item(&mut source_order.notebooks, &old_name);

    let mut dest_order = if dest_parent_dir == old_parent_dir {
        source_order.clone()
    } else {
        read_order(&dest_parent_dir)
    };
    if dest_parent_dir != old_parent_dir {
        remove_order_item(&mut dest_order.notebooks, &final_name);
    }
    let mut insert_at = dest_order.notebooks.len();
    if let Some(before) = before_name.as_deref() {
        if let Some(idx) = dest_order.notebooks.iter().position(|n| n == before) {
          insert_at = idx;
        }
    }
    if insert_at >= dest_order.notebooks.len() {
        append_order_item(&mut dest_order.notebooks, &final_name);
    } else {
        dest_order.notebooks.retain(|x| x != &final_name);
        dest_order.notebooks.insert(insert_at, final_name.clone());
    }
    write_order(&dest_parent_dir, &dest_order)?;
    if dest_parent_dir != old_parent_dir {
        write_order(old_parent_dir, &source_order)?;
    }
    let new_path = match to_parent_path.map(str::trim).filter(|s| !s.is_empty()) {
        Some(parent) => format!("{parent}/{final_name}"),
        None => final_name,
    };
    Ok(new_path)
}

/// 将笔记移动到目标笔记本，返回新路径
pub fn move_note(path: &str, to_notebook_path: &str) -> LibraryResult<String> {
    ensure_roots()?;
    let source = note_package_url(path)?;
    if !source.exists() {
        return Err(LibraryError::Message("笔记不存在".into()));
    }
    let title = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("note")
        .to_string();
    let current_nb = parent_rel_path(path).unwrap_or_default();
    if current_nb == to_notebook_path {
        return Ok(path.to_string());
    }
    let dest_nb = paths::notebook_path(to_notebook_path)?;
    if !dest_nb.is_dir() {
        return Err(LibraryError::Message("目标笔记本不存在".into()));
    }
    let mut final_title = title.clone();
    let mut i = 2;
    while dest_nb.join(&final_title).exists() {
        final_title = format!("{title} {i}");
        i += 1;
    }
    let dest = dest_nb.join(&final_title);
    fs::rename(&source, &dest)?;
    if final_title != title {
        let old_md = dest.join(format!("{title}.md"));
        let new_md = dest.join(format!("{final_title}.md"));
        if old_md.exists() {
            fs::rename(&old_md, &new_md)?;
            sync_leading_heading(&new_md, &final_title);
        }
    }
    if let Some(parent_dir) = source.parent() {
        let mut order = read_order(parent_dir);
        remove_order_item(&mut order.notes, &title);
        write_order(parent_dir, &order)?;
    }
    {
        let mut order = read_order(&dest_nb);
        append_order_item(&mut order.notes, &final_title);
        write_order(&dest_nb, &order)?;
    }
    Ok(format!("{to_notebook_path}/{final_title}"))
}

pub fn reorder_notebooks(parent_path: Option<&str>, ordered: Vec<String>) -> LibraryResult<()> {
    ensure_roots()?;
    let dir = match parent_path {
        Some(p) if !p.trim().is_empty() => paths::notebook_path(p)?,
        _ => paths::notebooks_root()?,
    };
    if !dir.is_dir() {
        return Err(LibraryError::Message("父目录不存在".into()));
    }
    let mut order = read_order(&dir);
    order.notebooks = ordered;
    write_order(&dir, &order)
}

pub fn reorder_notes(notebook_path: &str, ordered: Vec<String>) -> LibraryResult<()> {
    ensure_roots()?;
    let dir = paths::notebook_path(notebook_path)?;
    if !dir.is_dir() {
        return Err(LibraryError::Message("笔记本不存在".into()));
    }
    let mut order = read_order(&dir);
    order.notes = ordered;
    write_order(&dir, &order)
}

fn file_created_at(path: &Path) -> Option<chrono::DateTime<chrono::Utc>> {
    fs::metadata(path).ok()?.created().ok().map(chrono::DateTime::from)
}

pub fn move_note_to_trash(path: &str) -> LibraryResult<()> {
    ensure_roots()?;
    let source = note_package_url(path)?;
    if !source.exists() {
        return Err(LibraryError::Message(format!("笔记不存在：{path}")));
    }
    if !is_note_package(&source) {
        return Err(LibraryError::Message(format!("不是有效笔记包：{path}")));
    }
    let created_at = file_created_at(&source);
    let title = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("note")
        .to_string();
    let id = uuid::Uuid::new_v4().to_string();
    let entry = paths::trash_entry(&id)?;
    let payload = entry.join("payload");
    fs::create_dir_all(&entry)?;
    fs::rename(&source, &payload)?;
    let meta = TrashMeta {
        id: id.clone(),
        kind: "note".into(),
        original_path: path.to_string(),
        title,
        trashed_at: chrono::Utc::now(),
        created_at,
    };
    crate::storage::atomic_write(entry.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
    Ok(())
}

pub fn move_notebook_to_trash(path: &str) -> LibraryResult<()> {
    ensure_roots()?;
    let source = paths::notebook_path(path)?;
    if !source.is_dir() {
        return Err(LibraryError::Message(format!("笔记本不存在：{path}")));
    }
    let created_at = file_created_at(&source);
    let title = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("notebook")
        .to_string();
    let id = uuid::Uuid::new_v4().to_string();
    let entry = paths::trash_entry(&id)?;
    let payload = entry.join("payload");
    fs::create_dir_all(&entry)?;
    fs::rename(&source, &payload)?;
    let meta = TrashMeta {
        id: id.clone(),
        kind: "notebook".into(),
        original_path: path.to_string(),
        title,
        trashed_at: chrono::Utc::now(),
        created_at,
    };
    crate::storage::atomic_write(entry.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
    Ok(())
}

/// 在访达中显示库内相对路径（笔记包或笔记本目录）
pub fn reveal_in_finder(relative_path: &str) -> LibraryResult<()> {
    ensure_roots()?;
    let full = if relative_path.is_empty() {
        paths::notebooks_root()?
    } else {
        paths::notebook_path(relative_path)?
    };
    if !full.exists() {
        return Err(LibraryError::Message("路径不存在".into()));
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg("-R")
            .arg(&full)
            .status()?;
        if !status.success() {
            return Err(LibraryError::Message("无法在访达中打开".into()));
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        // Note packages and notebooks are directories. Pass the path directly,
        // without cmd.exe, so spaces and shell characters remain literal.
        std::process::Command::new("explorer.exe").arg(&full).spawn()?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = full;
        Err(LibraryError::Message("当前平台暂不支持访达打开".into()))
    }
}

fn trash_item_from_meta(meta: TrashMeta, payload: &Path) -> LibraryTrashItem {
    let created_at = meta.created_at.or_else(|| {
        // Legacy entries predate createdAt; renaming on macOS preserves birth time.
        file_created_at(payload).filter(|created| *created <= meta.trashed_at)
    });
    LibraryTrashItem {
        id: meta.id,
        kind: meta.kind,
        original_path: meta.original_path,
        title: meta.title,
        trashed_at: meta.trashed_at.to_rfc3339(),
        created_at: created_at.map(|created| created.to_rfc3339()),
    }
}

pub fn list_trash() -> LibraryResult<Vec<LibraryTrashItem>> {
    ensure_roots()?;
    let mut items = Vec::new();
    for entry in fs::read_dir(paths::trash_root()?)? {
        let entry = entry?.path();
        if !entry.is_dir() {
            continue;
        }
        let meta_path = entry.join("meta.json");
        let Ok(raw) = fs::read_to_string(meta_path) else {
            continue;
        };
        let Ok(meta) = serde_json::from_str::<TrashMeta>(&raw) else {
            continue;
        };
        items.push(trash_item_from_meta(meta, &entry.join("payload")));
    }
    items.sort_by(|a, b| b.trashed_at.cmp(&a.trashed_at));
    Ok(items)
}

pub fn restore_trash_item(id: &str) -> LibraryResult<()> {
    let entry = paths::trash_entry(id)?;
    let meta: TrashMeta = serde_json::from_str(&fs::read_to_string(entry.join("meta.json"))?)?;
    let payload = entry.join("payload");
    let dest = paths::notebook_path(&meta.original_path)?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    if dest.exists() {
        return Err(LibraryError::Message(format!(
            "目标已存在：{}",
            meta.original_path
        )));
    }
    fs::rename(payload, dest)?;
    fs::remove_dir_all(entry)?;
    Ok(())
}

pub fn permanently_delete_trash_item(id: &str) -> LibraryResult<()> {
    let entry = paths::trash_entry(id)?;
    if entry.exists() {
        fs::remove_dir_all(entry)?;
    }
    Ok(())
}

pub fn empty_trash() -> LibraryResult<()> {
    ensure_roots()?;
    for entry in fs::read_dir(paths::trash_root()?)? {
        let path = entry?.path();
        if path.is_dir() {
            fs::remove_dir_all(path)?;
        }
    }
    Ok(())
}

pub fn library_stats() -> LibraryResult<LibraryStats> {
    let notebooks = list_notebooks()?;
    let mut notebook_count = 0usize;
    let mut note_count = 0usize;
    fn walk(
        nodes: &[LibraryNotebook],
        notebook_count: &mut usize,
        note_count: &mut usize,
    ) {
        for n in nodes {
            *notebook_count += 1;
            *note_count += n.notes.len();
            walk(&n.children, notebook_count, note_count);
        }
    }
    walk(
        &notebooks,
        &mut notebook_count,
        &mut note_count,
    );
    Ok(LibraryStats {
        notebook_count,
        note_count,
        trash_count: list_trash()?.len(),
    })
}
