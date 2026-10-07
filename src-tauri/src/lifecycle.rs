use std::{collections::{HashSet, HashMap}, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[derive(Default)]
pub struct Shutdown { pub approved: bool, pub waiting: Option<(String, HashSet<String>)>, pub closing: HashMap<String, String> }
#[derive(Default)]
pub struct Lifecycle(pub Mutex<Shutdown>);

impl Shutdown {
    fn acknowledge(&mut self, label: &str, request_id: &str) -> bool {
        if let Some((id, waiting)) = &mut self.waiting {
            if id != request_id || !waiting.remove(label) { return false; }
            if waiting.is_empty() { self.approved = true; return true; }
        }
        false
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseRequest { pub quit: bool, pub request_id: String }

pub fn request_close(window: &tauri::Window) {
    let app = window.app_handle();
    let state = app.state::<Lifecycle>();
    let mut shutdown = state.0.lock().unwrap();
    if shutdown.waiting.is_some() || shutdown.closing.contains_key(window.label()) { return; }
    let request_id = uuid::Uuid::new_v4().to_string();
    shutdown.closing.insert(window.label().into(), request_id.clone());
    drop(shutdown);
    if window.emit_to(window.label(), "mne-save-before-close", CloseRequest { quit: false, request_id }).is_err() {
        state.0.lock().unwrap().closing.remove(window.label());
    }
}

pub fn request_quit(app: &AppHandle) {
    let state = app.state::<Lifecycle>();
    let mut shutdown = state.0.lock().unwrap();
    if shutdown.waiting.is_some() { return; }
    let windows = app.webview_windows();
    let request_id = uuid::Uuid::new_v4().to_string();
    shutdown.waiting = Some((request_id.clone(), windows.keys().cloned().collect()));
    drop(shutdown);
    for window in windows.values() {
        let _ = window.show();
        if window.emit_to(window.label(), "mne-save-before-close", CloseRequest { quit: true, request_id: request_id.clone() }).is_err() {
            state.0.lock().unwrap().waiting = None;
            let _ = app.emit("mne-close-cancelled", ());
        }
    }
}

#[tauri::command]
pub fn finish_close(app: AppHandle, window: WebviewWindow, quit: bool, request_id: String, success: bool) -> Result<(), String> {
    let state = app.state::<Lifecycle>();
    let mut shutdown = state.0.lock().unwrap();
    if !success {
        shutdown.waiting = None;
        shutdown.closing.remove(window.label());
        drop(shutdown);
        let _ = app.emit("mne-close-cancelled", ());
        return Ok(());
    }
    if !quit {
        if shutdown.closing.get(window.label()) != Some(&request_id) { return Ok(()); }
        shutdown.closing.remove(window.label());
        drop(shutdown);
        return window.destroy().map_err(|e| e.to_string());
    }
    if shutdown.acknowledge(window.label(), &request_id) {
        drop(shutdown);
        app.exit(0);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quit_waits_for_every_window_and_rejects_old_acknowledgements() {
        let mut state = Shutdown { waiting: Some(("current".into(), HashSet::from(["main".into(), "content-1".into()]))), ..Default::default() };
        assert!(!state.acknowledge("main", "old"));
        assert!(!state.acknowledge("unknown", "current"));
        assert!(!state.acknowledge("main", "current"));
        assert!(!state.approved);
        assert!(!state.acknowledge("main", "current"));
        assert!(state.acknowledge("content-1", "current"));
        assert!(state.approved);
        state.waiting = None;
        assert!(!state.acknowledge("content-1", "current"));
    }
}
