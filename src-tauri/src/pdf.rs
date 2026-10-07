use tauri::WebviewWindow;

#[cfg(target_os = "macos")]
static PDF_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
#[cfg(target_os = "macos")]
struct PdfGuard;
#[cfg(target_os = "macos")]
impl Drop for PdfGuard {
    fn drop(&mut self) { PDF_BUSY.store(false, std::sync::atomic::Ordering::Release); }
}

#[tauri::command]
pub async fn save_pdf(window: WebviewWindow, destination: String) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    { let _ = (window, destination); return Err("PDF 导出目前支持 macOS".into()); }
    #[cfg(target_os = "macos")]
    {
        if PDF_BUSY.swap(true, std::sync::atomic::Ordering::AcqRel) { return Err("另一个窗口正在导出 PDF，请稍后重试".into()); }
        let _guard = PdfGuard;
        let destination = crate::transfer::external_destination(&destination).map_err(|e| e.to_string())?;
        if !destination.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) { return Err("请选择 .pdf 文件".into()); }
        let (tx, rx) = std::sync::mpsc::channel();
        window.with_webview(move |webview| {
            objc2::rc::autoreleasepool(|_| unsafe {
                native::start(&*(webview.inner() as *const objc2_web_kit::WKWebView), destination, tx)
            });
        }).map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string())?)
            .await.map_err(|e| e.to_string())?
    }
}

#[cfg(target_os = "macos")]
mod native {
    use objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly, rc::Retained, runtime::Bool};
    use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob, NSPrintingPaginationMode, NSPrintOperation};
    use objc2_foundation::{NSSize, NSString, NSURL, NSObject, NSCopying};
    use std::{ffi::c_void, path::PathBuf, sync::mpsc::Sender};

    struct Job { temporary: PathBuf, destination: PathBuf, tx: Sender<Result<(), String>> }
    impl Job {
        fn finish(self, success: bool) {
            let result = (|| {
                if !success { return Err("PDF 生成失败或已取消".into()); }
                let bytes = std::fs::read(&self.temporary).map_err(|e| e.to_string())?;
                if !bytes.starts_with(b"%PDF-") { return Err("系统没有生成有效 PDF".into()); }
                std::fs::File::open(&self.temporary).and_then(|file| file.sync_all()).map_err(|e| e.to_string())?;
                std::fs::hard_link(&self.temporary, &self.destination).map_err(|e| e.to_string())?;
                Ok(())
            })();
            let _ = std::fs::remove_file(&self.temporary);
            let _ = self.tx.send(result);
        }
    }
    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        struct MnePdfPrintDelegate;
        impl MnePdfPrintDelegate {
            #[unsafe(method(printOperation:didRun:contextInfo:))]
            unsafe fn finished(&self, _operation: &NSPrintOperation, success: Bool, context: *mut c_void) {
                Box::from_raw(context as *mut Job).finish(success.as_bool());
                // The delegate is retained until AppKit delivers the completion callback.
                let _ = Retained::from_raw(self as *const Self as *mut Self);
            }
        }
    );

    pub unsafe fn start(view: &objc2_web_kit::WKWebView, destination: PathBuf, tx: Sender<Result<(), String>>) {
        let Some(window) = view.window() else { let _ = tx.send(Err("导出窗口已关闭".into())); return; };
        let temporary = destination.parent().unwrap().join(format!(".mne-pdf-{}.pdf", uuid::Uuid::new_v4()));
        let info = NSPrintInfo::sharedPrintInfo().copy();
        info.setPaperSize(NSSize::new(595.276, 841.89));
        info.setTopMargin(51.024); info.setBottomMargin(51.024);
        info.setLeftMargin(45.354); info.setRightMargin(45.354);
        info.setHorizontallyCentered(false); info.setVerticallyCentered(false);
        info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
        info.setVerticalPagination(NSPrintingPaginationMode::Automatic);
        info.setJobDisposition(NSPrintSaveJob);
        let url = NSURL::fileURLWithPath(&NSString::from_str(&temporary.to_string_lossy()));
        info.dictionary().setObject_forKey(&url, objc2::runtime::ProtocolObject::from_ref(NSPrintJobSavingURL));
        let operation = view.printOperationWithPrintInfo(&info);
        operation.setShowsPrintPanel(false);
        operation.setShowsProgressPanel(false);
        operation.setCanSpawnSeparateThread(true);
        let delegate: Retained<MnePdfPrintDelegate> = msg_send![MnePdfPrintDelegate::alloc(MainThreadMarker::new().unwrap()), init];
        let delegate = Retained::into_raw(delegate);
        let context = Box::into_raw(Box::new(Job { temporary, destination, tx }));
        operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            &window, Some(&*delegate), Some(sel!(printOperation:didRun:contextInfo:)), context.cast(),
        );
    }
}
