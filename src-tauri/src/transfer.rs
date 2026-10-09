use crate::{library, models::*, storage::atomic_write};
use base64::{engine::general_purpose::STANDARD, Engine};
use pulldown_cmark::{Event, Options, Parser, Tag};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, HashSet}, fs, path::{Component, Path, PathBuf}};

const LIMIT: u64 = 256 * 1024 * 1024;
const MAX_ENTRIES: usize = 50_000;
fn invalid(message: impl Into<String>) -> LibraryError { LibraryError::Message(message.into()) }

#[derive(Serialize, Deserialize)]
struct Entry { path: String, data: Option<String>, sha256: Option<String> }
#[derive(Serialize, Deserialize)]
struct Backup { format: String, version: u32, entries: Vec<Entry> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferResult { pub path: String, pub note_count: usize }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit { pub path: String, pub title: String, pub excerpt: String, pub line: usize }

fn safe_relative(raw: &str) -> LibraryResult<&Path> {
    let path = Path::new(raw);
    if raw.is_empty() || raw.contains('\\') || raw.split('/').any(|s| s.is_empty() || s == "." || s == "..") || path.components().any(|p| !matches!(p, Component::Normal(_))) {
        return Err(invalid("文件包含不安全的相对路径"));
    }
    if cfg!(windows) && raw.split('/').any(|part| !valid_windows_name(part)) {
        return Err(invalid("文件包含 Windows 不支持的名称"));
    }
    Ok(path)
}
fn regular(path: &Path) -> LibraryResult<fs::Metadata> {
    let meta = fs::symlink_metadata(path)?;
    if meta.file_type().is_symlink() || (!meta.is_file() && !meta.is_dir()) { return Err(invalid("不支持符号链接或特殊文件")); }
    Ok(meta)
}
fn collect(root: &Path, relative: &str, entries: &mut Vec<Entry>, size: &mut u64) -> LibraryResult<()> {
    if entries.len() >= MAX_ENTRIES { return Err(invalid("文件数量超过 50000")); }
    let path = root.join(safe_relative(relative)?);
    let meta = regular(&path)?;
    if meta.is_dir() {
        entries.push(Entry { path: relative.into(), data: None, sha256: None });
        for entry in fs::read_dir(path)? {
            let name = entry?.file_name().into_string().map_err(|_| invalid("文件名不是有效 UTF-8"))?;
            if name.starts_with(".mne-write-") { continue; }
            collect(root, &format!("{relative}/{name}"), entries, size)?;
        }
    } else {
        *size += meta.len();
        if *size > LIMIT { return Err(invalid("单次操作最多支持 256 MB")); }
        let bytes = fs::read(path)?;
        entries.push(Entry { path: relative.into(), sha256: Some(format!("{:x}", Sha256::digest(&bytes))), data: Some(STANDARD.encode(bytes)) });
    }
    Ok(())
}
pub(crate) fn external_destination(raw: &str) -> LibraryResult<PathBuf> {
    let path = PathBuf::from(raw);
    if !path.is_absolute() || path.exists() { return Err(invalid("请选择一个尚不存在的目标文件或目录")); }
    let parent = path.parent().ok_or_else(|| invalid("无效目标"))?.canonicalize()?;
    let library = paths::app_support()?.canonicalize()?;
    if parent.starts_with(library) { return Err(invalid("导出和备份目标不能放在应用数据目录内")); }
    Ok(parent.join(path.file_name().ok_or_else(|| invalid("无效目标"))?))
}
pub fn backup(destination: &str) -> LibraryResult<TransferResult> {
    library::ensure_roots()?;
    let dest = external_destination(destination)?;
    let mut entries = Vec::new();
    let mut size = 0;
    for name in ["Notebooks", "Trash"] { collect(&paths::app_support()?, name, &mut entries, &mut size)?; }
    let count = entries.iter().filter(|e| e.path.ends_with(".note.json")).count();
    atomic_write(&dest, serde_json::to_vec(&Backup { format: "MeteorNoteEditor".into(), version: 1, entries })?)?;
    Ok(TransferResult { path: dest.display().to_string(), note_count: count })
}

struct Stage(PathBuf);
impl Drop for Stage { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
fn stage() -> LibraryResult<Stage> {
    library::ensure_roots()?;
    let root = paths::app_support()?.join(format!(".mne-stage-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root)?;
    Ok(Stage(root))
}
fn unique_name(base: &str) -> LibraryResult<String> {
    let root = paths::notebooks_root()?;
    for index in 1..10_000 {
        let name = if index == 1 { base.into() } else { format!("{base} {index}") };
        if !root.join(&name).exists() { return Ok(name); }
    }
    Err(invalid("无法生成不重复的名称"))
}
pub fn restore(source: &str) -> LibraryResult<TransferResult> {
    let source = Path::new(source);
    if !regular(source)?.is_file() || fs::metadata(source)?.len() > LIMIT * 2 { return Err(invalid("备份文件无效或过大")); }
    let archive: Backup = serde_json::from_slice(&fs::read(source)?)?;
    if archive.format != "MeteorNoteEditor" || archive.version != 1 || archive.entries.len() > MAX_ENTRIES { return Err(invalid("不支持的备份格式")); }
    let work = stage()?;
    let mut seen = HashSet::new();
    let mut size = 0;
    let mut decoded_size = 0;
    for entry in &archive.entries {
        safe_relative(&entry.path)?;
        if !matches!(entry.path.split('/').next(), Some("Notebooks" | "Trash")) || !seen.insert(entry.path.to_lowercase()) { return Err(invalid("备份路径无效或重复")); }
        let dest = work.0.join(&entry.path);
        if let Some(encoded) = &entry.data {
            if dest.exists() { return Err(invalid("备份中的文件路径冲突")); }
            size += encoded.len() as u64;
            if size > LIMIT * 2 { return Err(invalid("备份超过大小限制")); }
            let bytes = STANDARD.decode(encoded).map_err(|_| invalid("备份数据损坏"))?;
            decoded_size += bytes.len() as u64;
            if decoded_size > LIMIT { return Err(invalid("备份超过 256 MB 限制")); }
            if entry.sha256.as_deref() != Some(&format!("{:x}", Sha256::digest(&bytes))) { return Err(invalid("备份校验失败，数据未恢复")); }
            fs::create_dir_all(dest.parent().unwrap())?;
            atomic_write(dest, bytes)?;
        } else { fs::create_dir_all(dest)?; }
    }
    let notebook_root = work.0.join("Notebooks");
    let trash_root = work.0.join("Trash");
    if !notebook_root.is_dir() || !trash_root.is_dir() { return Err(invalid("备份缺少笔记库或回收站")); }
    // Restore into a new container; existing notes are never replaced.
    let name = unique_name(&format!("恢复 {}", chrono::Local::now().format("%Y%m%d-%H%M%S")))?;
    atomic_write(notebook_root.join(".notebook.json"), br#"{"icon":"folder","colorHex":null}"#)?;
    let mut trash_moves = Vec::new();
    for entry in fs::read_dir(&trash_root)? {
        let item = entry?.path();
        let mut meta: TrashMeta = serde_json::from_slice(&fs::read(item.join("meta.json"))?)?;
        safe_relative(&meta.original_path)?;
        if !item.join("payload").is_dir() || !matches!(meta.kind.as_str(), "note" | "notebook") { return Err(invalid("回收站备份损坏")); }
        meta.id = uuid::Uuid::new_v4().to_string();
        meta.original_path = format!("{name}/{}", meta.original_path);
        atomic_write(item.join("meta.json"), serde_json::to_vec(&meta)?)?;
        trash_moves.push((item, paths::trash_entry(&meta.id)?));
    }
    let dest = paths::notebook_path(&name)?;
    fs::rename(&notebook_root, &dest)?;
    let mut published = Vec::new();
    for (from, to) in trash_moves {
        if let Err(error) = fs::rename(from, &to) {
            for path in published { let _ = fs::remove_dir_all(path); }
            let _ = fs::remove_dir_all(&dest);
            return Err(error.into());
        }
        published.push(to);
    }
    Ok(TransferResult { path: name, note_count: archive.entries.iter().filter(|e| e.path.starts_with("Notebooks/") && e.path.ends_with(".note.json")).count() })
}

fn copy_tree(source: &Path, dest: &Path, size: &mut u64) -> LibraryResult<()> {
    let meta = regular(source)?;
    if meta.is_dir() {
        fs::create_dir_all(dest)?;
        for entry in fs::read_dir(source)? { let entry = entry?; copy_tree(&entry.path(), &dest.join(entry.file_name()), size)?; }
    } else {
        *size += meta.len();
        if *size > LIMIT { return Err(invalid("单次操作最多支持 256 MB")); }
        fs::create_dir_all(dest.parent().unwrap())?;
        atomic_write(dest, fs::read(source)?)?;
    }
    Ok(())
}
fn markdown_files(source: &Path, root: &Path, files: &mut Vec<(PathBuf, PathBuf)>) -> LibraryResult<()> {
    if files.len() > 10_000 { return Err(invalid("单次最多导入 10000 篇笔记")); }
    let meta = regular(source)?;
    if meta.is_dir() {
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            if entry.file_name().to_string_lossy().starts_with('.') { continue; }
            markdown_files(&entry.path(), root, files)?;
        }
    } else if source.extension().is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown")) {
        files.push((source.to_path_buf(), root.to_path_buf()));
    }
    Ok(())
}
fn decode_path(raw: &str) -> LibraryResult<String> {
    let mut bytes = Vec::new(); let mut at = 0; let raw = raw.as_bytes();
    while at < raw.len() {
        if raw[at] == b'%' && at + 2 < raw.len() {
            let value = std::str::from_utf8(&raw[at+1..at+3]).ok().and_then(|s| u8::from_str_radix(s,16).ok()).ok_or_else(|| invalid("图片路径编码错误"))?;
            bytes.push(value); at += 3;
        } else { bytes.push(raw[at]); at += 1; }
    }
    String::from_utf8(bytes).map_err(|_| invalid("图片路径不是 UTF-8"))
}
pub(crate) fn import_images(body: &str, file: &Path, allowed_root: &Path, package: &Path, size: &mut u64) -> LibraryResult<String> {
    let mut images = Vec::new();
    for (event, range) in Parser::new_ext(body, Options::all()).into_offset_iter() {
        if let Event::Start(Tag::Image { dest_url, .. }) = event { images.push((dest_url.to_string(), range)); }
    }
    let mut edits = Vec::new(); let mut copied: HashMap<PathBuf, String> = HashMap::new();
    for (url, range) in images {
        if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("data:") || url.starts_with("//") { continue; }
        let decoded = decode_path(&url)?;
        if decoded.contains(':') { return Err(invalid("不支持的图片地址")); }
        let source = file.parent().unwrap().join(&decoded).canonicalize().map_err(|_| invalid(format!("图片不存在：{url}")))?;
        if !source.starts_with(allowed_root) || !regular(&source)?.is_file() { return Err(invalid(format!("图片超出所选目录：{url}"))); }
        let target = if let Some(value) = copied.get(&source) { value.clone() } else {
            let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("bin");
            let value = format!("assets/{}.{}", uuid::Uuid::new_v4(), ext);
            copy_tree(&source, &package.join(&value), size)?;
            copied.insert(source, value.clone()); value
        };
        // Replace the parser's complete image range, preserving alt text and size metadata.
        let raw = &body[range.clone()];
        let alt = raw.strip_prefix("![").and_then(|s| s.find(']').map(|i| &s[..i])).unwrap_or("图片");
        edits.push((range, format!("![{alt}]({target})")));
    }
    let mut result = body.to_owned();
    edits.sort_by_key(|(range,_)| std::cmp::Reverse(range.start));
    for (range, replacement) in edits { result.replace_range(range, &replacement); }
    Ok(result)
}
fn import_target(notebook: &str) -> LibraryResult<PathBuf> {
    let target = paths::notebook_path(notebook)?;
    if !regular(&target)?.is_dir() { return Err(invalid("目标笔记本不存在")); }
    let root = paths::notebooks_root()?;
    for directory in target.ancestors().take_while(|path| *path != root) {
        let name = directory.file_name().ok_or_else(|| invalid("无效的笔记本路径"))?.to_string_lossy();
        if directory.join(".note.json").exists() || directory.join(format!("{name}.md")).is_file() {
            return Err(invalid("请选择笔记本，不能导入到笔记内部"));
        }
    }
    Ok(target)
}

// Only publish fully prepared packages. Rollback removes newly added entries,
// never existing notes, notebook metadata or manual ordering.
fn publish_import(source: &Path, target: &Path, published: &mut Vec<PathBuf>) -> LibraryResult<()> {
    let mut entries = fs::read_dir(source)?.map(|entry| entry.map(|entry| entry.path())).collect::<Result<Vec<_>, _>>()?;
    entries.sort();
    for entry in entries {
        if !regular(&entry)?.is_dir() { continue; }
        let name = entry.file_name().and_then(|name| name.to_str()).ok_or_else(|| invalid("无效文件名"))?;
        let note = entry.join(".note.json").is_file();
        let mut destination = target.join(name);
        if !note && fs::symlink_metadata(&destination).is_ok() {
            let meta = regular(&destination)?;
            if meta.is_dir() && !destination.join(".note.json").exists() && !destination.join(format!("{name}.md")).is_file() {
                publish_import(&entry, &destination, published)?;
                continue;
            }
        }
        let mut index = 2;
        while fs::symlink_metadata(&destination).is_ok() {
            destination = target.join(format!("{name} {index}"));
            index += 1;
        }
        if note {
            let new_name = destination.file_name().unwrap().to_string_lossy();
            if new_name != name { fs::rename(entry.join(format!("{name}.md")), entry.join(format!("{new_name}.md")))?; }
        }
        fs::rename(&entry, &destination)?;
        published.push(destination);
    }
    Ok(())
}

pub fn import_markdown(sources: Vec<String>, target_notebook: &str) -> LibraryResult<TransferResult> {
    if sources.is_empty() { return Err(invalid("未选择 Markdown 文件")); }
    let target = import_target(target_notebook)?;
    let work = stage()?; let mut files = Vec::new();
    for source in sources {
        let path = PathBuf::from(source); regular(&path)?;
        let path = path.canonicalize()?;
        let root = if path.is_dir() { path.clone() } else { path.parent().unwrap().to_path_buf() };
        markdown_files(&path, &root, &mut files)?;
    }
    files.sort(); files.dedup();
    if files.is_empty() { return Err(invalid("所选内容中没有 Markdown 文件")); }
    let notebook = work.0.join("notebook"); fs::create_dir(&notebook)?;
    atomic_write(notebook.join(".notebook.json"), br#"{"icon":"folder","colorHex":null}"#)?;
    for (file, root) in &files {
        let relative = file.strip_prefix(root).map_err(|_| invalid("无效导入路径"))?;
        fs::create_dir_all(notebook.join(relative.parent().unwrap()))?;
    }
    let mut size = 0;
    for (file, root) in &files {
        size += fs::metadata(file)?.len();
        if size > LIMIT { return Err(invalid("导入内容超过 256 MB")); }
        let body = fs::read_to_string(file)?;
        let relative = file.strip_prefix(root).map_err(|_| invalid("无效导入路径"))?;
        let parent = relative.parent().unwrap();
        let title = file.file_stem().and_then(|s| s.to_str()).ok_or_else(|| invalid("无效文件名"))?;
        let mut dest = notebook.join(parent).join(title);
        let mut index = 2;
        while dest.exists() { dest = notebook.join(parent).join(format!("{title} {index}")); index += 1; }
        fs::create_dir_all(dest.join("assets"))?; fs::create_dir(dest.join("versions"))?;
        let title = dest.file_name().unwrap().to_string_lossy();
        let body = import_images(&body, file, root, &dest, &mut size)?;
        atomic_write(dest.join(format!("{title}.md")), body)?;
        atomic_write(dest.join(".note.json"), br#"{"icon":"document","colorHex":null}"#)?;
    }
    let mut published = Vec::new();
    if let Err(error) = publish_import(&notebook, &target, &mut published) {
        for path in published.iter().rev() { let _ = fs::remove_dir_all(path); }
        return Err(error);
    }
    Ok(TransferResult { path: target_notebook.into(), note_count: files.len() })
}

pub fn export_note(destination: &str, note_path: &str) -> LibraryResult<TransferResult> {
    safe_relative(note_path)?;
    let source = paths::notebook_path(note_path)?;
    let title = source.file_name().ok_or_else(|| invalid("无效笔记路径"))?;
    let markdown = source.join(format!("{}.md", title.to_string_lossy()));
    if !regular(&source)?.is_dir() || !regular(&markdown)?.is_file() { return Err(invalid("笔记不存在")); }
    let dest = external_destination(destination)?;
    let work = Stage(dest.parent().unwrap().join(format!(".mne-export-{}", uuid::Uuid::new_v4())));
    fs::create_dir(&work.0)?;
    let mut size = 0;
    copy_tree(&markdown, &work.0.join(markdown.file_name().unwrap()), &mut size)?;
    if source.join("assets").exists() { copy_tree(&source.join("assets"), &work.0.join("assets"), &mut size)?; }
    fs::rename(&work.0, &dest)?;
    Ok(TransferResult { path: dest.display().to_string(), note_count: 1 })
}
pub fn search(query: &str) -> LibraryResult<Vec<SearchHit>> {
    let query = query.trim().to_lowercase();
    if query.is_empty() { return Ok(Vec::new()); }
    let mut hits = Vec::new();
    fn walk(nodes: Vec<LibraryNotebook>, query: &str, hits: &mut Vec<SearchHit>) -> LibraryResult<()> {
        for node in nodes {
            for note in node.notes {
                let body = library::read_note(&note.id)?;
                let found = body.lines().enumerate().find(|(_,line)| line.to_lowercase().contains(query));
                if let Some((line, text)) = found {
                    let lowered = text.to_lowercase();
                    let at = lowered.find(query).unwrap_or(0);
                    let char_at = lowered[..at].chars().count();
                    hits.push(SearchHit { path: note.id, title: note.title, line: line + 1, excerpt: text.chars().skip(char_at.saturating_sub(35)).take(150).collect() });
                } else if note.id.to_lowercase().contains(query) {
                    hits.push(SearchHit { path: note.id, title: note.title, line: 1, excerpt: body.lines().skip(1).collect::<Vec<_>>().join(" ").chars().take(150).collect() });
                }
                if hits.len() >= 500 { return Ok(()); }
            }
            walk(node.children, query, hits)?;
            if hits.len() >= 500 { return Ok(()); }
        }
        Ok(())
    }
    walk(library::list_notebooks()?, &query, &mut hits)?;
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(test: impl FnOnce(&Path, &Path)) {
        let base = std::env::temp_dir().join(format!("mne-transfer-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&base).unwrap();
        let app = base.join("app");
        paths::with_test_root(app.clone(), || { library::ensure_roots().unwrap(); test(&base, &app); });
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn backup_restore_retains_assets_history_trash_and_existing_notes() {
        fixture(|base, _| {
            let nb = library::create_notebook(Some("备份测试".into()), None).unwrap();
            let note = library::create_note(&nb, Some("原文".into())).unwrap();
            library::write_note(&note, "# 原文\n\n备份内容 ![图](assets/a.png)\n").unwrap();
            let pkg = paths::notebook_path(&note).unwrap();
            atomic_write(pkg.join("assets/a.png"), b"image bytes").unwrap();
            let deleted = library::create_note(&nb, Some("已删除".into())).unwrap();
            library::move_note_to_trash(&deleted).unwrap();
            let backup_path = base.join("test.mnebackup");
            backup(backup_path.to_str().unwrap()).unwrap();
            library::write_note(&note, "# 原文\n\n当前内容\n").unwrap();
            let result = restore(backup_path.to_str().unwrap()).unwrap();
            assert_eq!(library::read_note(&note).unwrap(), "# 原文\n\n当前内容\n");
            let restored = format!("{}/{}", result.path, note);
            assert!(library::read_note(&restored).unwrap().contains("备份内容"));
            assert_eq!(fs::read(paths::notebook_path(&restored).unwrap().join("assets/a.png")).unwrap(), b"image bytes");
            assert!(!library::list_note_versions(&restored).unwrap().is_empty());
            let trash = library::list_trash().unwrap();
            assert_eq!(trash.len(), 2);
            let item = trash.iter().find(|item| item.original_path.starts_with(&result.path)).unwrap();
            library::restore_trash_item(&item.id).unwrap();
            assert!(library::read_note(&format!("{}/{}", result.path, deleted)).is_ok());
        });
    }
    #[test]
    fn invalid_backup_does_not_publish_any_content() {
        fixture(|base, _| {
            let file = base.join("test.mnebackup"); backup(file.to_str().unwrap()).unwrap();
            let before = library::list_notebooks().unwrap().len();
            let original = fs::read(&file).unwrap();
            for corrupt_path in [true, false] {
                let mut archive: Backup = serde_json::from_slice(&original).unwrap();
                let entry = archive.entries.iter_mut().find(|entry| entry.data.is_some()).unwrap();
                if corrupt_path { entry.path = "Notebooks/../../escape".into(); }
                else { entry.sha256 = Some("invalid".into()); }
                atomic_write(&file, serde_json::to_vec(&archive).unwrap()).unwrap();
                assert!(restore(file.to_str().unwrap()).is_err());
                assert_eq!(library::list_notebooks().unwrap().len(), before);
                assert!(!base.join("escape").exists());
            }
        });
    }
    #[test]
    fn import_export_images_references_unicode_search_and_duplicate_names() {
        fixture(|base, _| {
            let source = base.join("source"); fs::create_dir_all(source.join("章节")).unwrap();
            atomic_write(source.join("图 (1).png"), b"png data").unwrap();
            atomic_write(source.join("章节/正文.md"), "# 正文\n\n只在正文出现的关键词\n![图片](<../图 (1).png>)\n![引用][pic]\n\n[pic]: <../图 (1).png>\n").unwrap();
            atomic_write(source.join("章节.md"), "# 同名文件夹\n").unwrap();
            let target = library::create_notebook(Some("导入目标".into()), None).unwrap();
            let result = import_markdown(vec![source.display().to_string()], &target).unwrap();
            assert_eq!(result.note_count, 2);
            let path = format!("{}/章节/正文", result.path);
            let body = library::read_note(&path).unwrap();
            assert!(body.contains("![图片](assets/"));
            assert!(body.contains("![引用](assets/"));
            assert_eq!(fs::read_dir(paths::notebook_path(&path).unwrap().join("assets")).unwrap().count(), 1);
            let hits = search("只在正文出现的关键词").unwrap();
            assert_eq!(hits.len(), 1); assert_eq!(hits[0].path, path); assert_eq!(hits[0].line, 3);
            assert!(library::read_note(&format!("{}/章节 2", result.path)).is_ok());
            let single = base.join("single-note");
            let result = export_note(single.to_str().unwrap(), &path).unwrap();
            assert_eq!(result.note_count, 1);
            assert_eq!(fs::read_to_string(single.join("正文.md")).unwrap(), body);
            assert_eq!(fs::read_dir(single.join("assets")).unwrap().count(), 1);
            assert_eq!(fs::read_dir(&single).unwrap().count(), 2);
            assert!(export_note(single.to_str().unwrap(), &path).is_err());
            let invalid_dest = base.join("invalid-export");
            assert!(export_note(invalid_dest.to_str().unwrap(), "../escape").is_err());
            assert!(export_note(invalid_dest.to_str().unwrap(), &result.path).is_err());
            assert!(!invalid_dest.exists());
        });
    }
    #[test]
    fn import_into_selected_child_keeps_existing_notes_and_renames_duplicates() {
        fixture(|base, _| {
            let parent = library::create_notebook(Some("工作".into()), None).unwrap();
            let target = library::create_notebook(Some("资料".into()), Some(parent.clone())).unwrap();
            let existing = library::create_note(&target, Some("记录".into())).unwrap();
            library::write_note(&existing, "# 记录\n\n原来的内容").unwrap();
            let directory = paths::notebook_path(&target).unwrap();
            let order = fs::read(directory.join(".order.json")).unwrap();
            let root_count = library::list_notebooks().unwrap().len();
            let source = base.join("记录.md");
            atomic_write(base.join("图.png"), b"image bytes").unwrap();
            atomic_write(&source, "# 记录\n\n导入的内容 ![图](图.png)").unwrap();
            for suffix in ["2", "3"] {
                let result = import_markdown(vec![source.display().to_string()], &target).unwrap();
                assert_eq!(result.path, target);
                assert_eq!(result.note_count, 1);
                let note = format!("{target}/记录 {suffix}");
                assert!(library::read_note(&note).unwrap().contains("导入的内容 ![图](assets/"));
                assert_eq!(fs::read_dir(paths::notebook_path(&note).unwrap().join("assets")).unwrap().count(), 1);
            }
            assert_eq!(library::read_note(&existing).unwrap(), "# 记录\n\n原来的内容");
            assert_eq!(fs::read(directory.join(".order.json")).unwrap(), order);
            assert_eq!(library::list_notebooks().unwrap().len(), root_count);
            assert!(!paths::notebook_path(&format!("{parent}/记录")).unwrap().exists());
        });
    }
    #[test]
    fn folder_import_merges_subnotebooks_and_avoids_note_directory_collisions() {
        fixture(|base, _| {
            let target = library::create_notebook(Some("目标".into()), None).unwrap();
            let child = library::create_notebook(Some("章节".into()), Some(target.clone())).unwrap();
            let existing = library::create_note(&child, Some("保留".into())).unwrap();
            let collision = library::create_note(&target, Some("同名目录".into())).unwrap();
            let source = base.join("source");
            fs::create_dir_all(source.join("章节")).unwrap();
            fs::create_dir_all(source.join("同名目录")).unwrap();
            atomic_write(source.join("正文.md"), "# 正文").unwrap();
            atomic_write(source.join("章节/新文.markdown"), "# 新文").unwrap();
            atomic_write(source.join("同名目录/子文.md"), "# 子文").unwrap();
            let result = import_markdown(vec![source.display().to_string()], &target).unwrap();
            assert_eq!(result.note_count, 3);
            assert_eq!(library::read_note(&format!("{target}/正文")).unwrap(), "# 正文");
            assert_eq!(library::read_note(&format!("{child}/新文")).unwrap(), "# 新文");
            assert_eq!(library::read_note(&format!("{target}/同名目录 2/子文")).unwrap(), "# 子文");
            assert_eq!(library::read_note(&existing).unwrap(), "# 保留\n");
            assert_eq!(library::read_note(&collision).unwrap(), "# 同名目录\n");
        });
    }
    #[test]
    fn invalid_target_and_broken_import_leave_selected_notebook_unchanged() {
        fixture(|base, _| {
            let target = library::create_notebook(Some("目标".into()), None).unwrap();
            let existing = library::create_note(&target, Some("原文".into())).unwrap();
            let good = base.join("新文.md"); atomic_write(&good, "# 新文").unwrap();
            let broken = base.join("坏文.md"); atomic_write(&broken, "![缺失](missing.png)").unwrap();
            for invalid_target in ["".to_owned(), "../escape".into(), "不存在".into(), existing.clone(), format!("{existing}/assets")] {
                assert!(import_markdown(vec![good.display().to_string()], &invalid_target).is_err());
            }
            assert!(import_markdown(vec![good.display().to_string(), broken.display().to_string()], &target).is_err());
            assert!(!paths::notebook_path(&format!("{target}/新文")).unwrap().exists());
            assert!(!paths::notebook_path("不存在").unwrap().exists());
            assert_eq!(library::read_note(&existing).unwrap(), "# 原文\n");
        });
    }
    #[cfg(unix)]
    #[test]
    fn failed_publish_rolls_back_only_new_entries() {
        fixture(|base, _| {
            let target = library::create_notebook(Some("目标".into()), None).unwrap();
            let existing = library::create_note(&target, Some("保留".into())).unwrap();
            let source = base.join("source"); fs::create_dir_all(source.join("Z")).unwrap();
            atomic_write(source.join("A.md"), "# A").unwrap();
            atomic_write(source.join("Z/子文.md"), "# 子文").unwrap();
            let outside = base.join("outside"); fs::create_dir(&outside).unwrap();
            let link = paths::notebook_path(&target).unwrap().join("Z");
            std::os::unix::fs::symlink(&outside, &link).unwrap();
            assert!(import_markdown(vec![source.display().to_string()], &target).is_err());
            assert!(!paths::notebook_path(&format!("{target}/A")).unwrap().exists());
            assert!(fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
            assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
            assert_eq!(library::read_note(&existing).unwrap(), "# 保留\n");
        });
    }
    #[test]
    fn missing_image_aborts_import_and_existing_targets_are_not_overwritten() {
        fixture(|base, _| {
            let file = base.join("broken.md"); atomic_write(&file, "![missing](missing.png)").unwrap();
            let before = library::list_notebooks().unwrap().len();
            let target = library::list_notebooks().unwrap()[0].id.clone();
            assert!(import_markdown(vec![file.display().to_string()], &target).is_err());
            assert_eq!(library::list_notebooks().unwrap().len(), before);
            assert!(backup(file.to_str().unwrap()).is_err());
            assert_eq!(fs::read_to_string(&file).unwrap(), "![missing](missing.png)");
        });
    }
}
