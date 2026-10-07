#[tauri::command]
fn pdf_test_done(app: tauri::AppHandle, error: Option<String>) {
    if let Some(error) = error { eprintln!("PDF regression failed: {error}"); app.exit(1); }
    else { println!("PDF regression passed"); app.exit(0); }
}

fn main() {
    let output = std::env::args().nth(1).expect("provide a new temporary PDF output path");
    let directory = std::path::Path::new(&output).parent().unwrap().to_path_buf();
    std::fs::create_dir(&directory).expect("use a new, isolated temporary directory");
    std::thread::spawn(move || {
        let start = std::time::Instant::now();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(250));
            let size: u64 = std::fs::read_dir(&directory).unwrap().filter_map(Result::ok)
                .filter_map(|file| file.metadata().ok()).map(|meta| meta.len()).sum();
            if size > 32 * 1024 * 1024 || start.elapsed().as_secs() > 40 {
                eprintln!("PDF regression stopped by 32 MB / 40 second safety limit");
                let _ = std::fs::remove_dir_all(directory);
                std::process::exit(1);
            }
        }
    });
    let mut context = tauri::generate_context!();
    let mut url: tauri::Url = "http://localhost:5183/scripts/pdf-smoke.html".parse().unwrap();
    url.query_pairs_mut().append_pair("output", &output);
    context.config_mut().app.windows[0].url = tauri::WebviewUrl::External(url);
    context.config_mut().app.windows[0].title = "PDF export regression".into();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![meteor_note_editor_lib::pdf::save_pdf, pdf_test_done])
        .run(context).expect("PDF regression app failed");
}
