#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod open_requests;
mod quit_state;
use open_requests::OpenRequests;
use quit_state::QuitState;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
#[derive(Default)]
struct PendingFiles(Mutex<OpenRequests>);

#[derive(Default)]
struct SelectedFile(Mutex<Vec<std::path::PathBuf>>);

fn write_file(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use gio::prelude::*;
        gio::File::for_path(path)
            .replace_contents(
                bytes,
                None,
                false,
                gio::FileCreateFlags::NONE,
                gio::Cancellable::NONE,
            )
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "linux"))]
    {
        use std::io::Write;
        let mut file =
            tempfile::NamedTempFile::new_in(path.parent().ok_or("Missing destination directory")?)
                .map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.as_file().sync_all().map_err(|e| e.to_string())?;
        file.persist(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
async fn open_project(
    app: tauri::AppHandle,
    selected: State<'_, SelectedFile>,
    request_id: Option<u32>,
) -> Result<Option<(String, String, usize)>, String> {
    use tauri_plugin_dialog::DialogExt;
    let queued = match request_id {
        Some(id) => Some(
            app.state::<PendingFiles>()
                .0
                .lock()
                .map_err(|e| e.to_string())?
                .path(id)
                .ok_or("File-open request is no longer available")?,
        ),
        None => None,
    };
    let path = if let Some(path) = queued {
        path
    } else {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("Leather project", &["leather", "json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        file.into_path().map_err(|e| e.to_string())?
    };
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 10_000_000 {
        return Err("Project exceeds 10 MB".into());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .ok_or("Invalid filename")?
        .to_string_lossy()
        .into_owned();
    let mut files = selected.0.lock().map_err(|e| e.to_string())?;
    files.push(path);
    Ok(Some((text, name, files.len())))
}

#[tauri::command]
async fn save_project(
    app: tauri::AppHandle,
    selected: State<'_, SelectedFile>,
    text: String,
    name: String,
    token: Option<usize>,
) -> Result<Option<(String, usize)>, String> {
    use tauri_plugin_dialog::DialogExt;
    if text.len() > 10_000_000 {
        return Err("Project exceeds 10 MB".into());
    }
    let path = token
        .and_then(|id| id.checked_sub(1))
        .and_then(|id| selected.0.lock().ok()?.get(id).cloned());
    let path = match path {
        Some(path) => path,
        None => {
            let Some(file) = app
                .dialog()
                .file()
                .set_file_name(&name)
                .add_filter("Leather project", &["leather"])
                .blocking_save_file()
            else {
                return Ok(None);
            };
            file.into_path().map_err(|e| e.to_string())?
        }
    };
    write_file(&path, text.as_bytes())?;
    let name = path
        .file_name()
        .ok_or("Invalid filename")?
        .to_string_lossy()
        .into_owned();
    let mut files = selected.0.lock().map_err(|e| e.to_string())?;
    files.push(path);
    Ok(Some((name, files.len())))
}

#[tauri::command]
async fn save_artifact(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(file) = app
        .dialog()
        .file()
        .set_file_name(&name)
        .blocking_save_file()
    else {
        return Ok(false);
    };
    write_file(&file.into_path().map_err(|e| e.to_string())?, &bytes)?;
    Ok(true)
}
#[tauri::command]
async fn release_list() -> Result<serde_json::Value, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .get("https://api.github.com/repos/wieli99/Leather-Pattern-Studio/releases?per_page=100")
        .header("User-Agent", "Leather-Pattern-Studio")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn open_help(app: tauri::AppHandle, destination: Option<String>) -> Result<(), String> {
    let destination = destination.unwrap_or_default();
    if !destination
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '/')
    {
        return Err("Invalid manual destination".into());
    }
    if let Some(window) = app.get_webview_window("manual") {
        if !destination.is_empty() {
            window
                .eval(&format!("location.hash = '#{}'", destination))
                .map_err(|e| e.to_string())?;
        }
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        tauri::WebviewWindowBuilder::new(
            &app,
            "manual",
            tauri::WebviewUrl::App(format!("manual/index.html#{}", destination).into()),
        )
        .title("Leather Pattern Studio — Help")
        .build()
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn pending_files(app: tauri::AppHandle) -> Option<u32> {
    let pending = app.state::<PendingFiles>();
    let mut requests = pending.0.lock().unwrap();
    if requests.rejected_batch {
        requests.rejected_batch = false;
        let _ = app.emit("desktop-error", "Open one project at a time.");
    }
    requests.first()
}
#[tauri::command]
async fn focus_editor(app: tauri::AppHandle) -> Result<(), String> {
    let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
                .ok_or("Editor configuration is unavailable")?;
            tauri::WebviewWindowBuilder::from_config(&app, config)
                .map_err(|e| e.to_string())?
                .build()
                .map_err(|e| e.to_string())?
        }
    };
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
fn desktop_ready(app: tauri::AppHandle) {
    app.state::<QuitState>().arm();
}
#[tauri::command]
async fn close_editor(app: tauri::AppHandle, quit: bool) -> Result<(), String> {
    app.state::<QuitState>().approve();
    if quit {
        app.exit(0);
    } else if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.destroy() {
            app.state::<QuitState>().arm();
            return Err(error.to_string());
        }
    }
    Ok(())
}
#[tauri::command]
async fn confirm_replace(app: tauri::AppHandle) -> bool {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    app.dialog()
        .message("You have unsaved changes. Continue without saving?")
        .title("Unsaved project")
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show()
}
#[tauri::command]
fn clear_pending(app: tauri::AppHandle, request_id: u32) {
    app.state::<PendingFiles>()
        .0
        .lock()
        .unwrap()
        .acknowledge(request_id);
}
#[tauri::command]
fn desktop_target() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}
// Window construction must not block a native event handler on Windows.
fn focus_editor_in_background(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = focus_editor(app.clone()).await {
            let _ = app.emit("desktop-error", error);
        }
    });
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths: Vec<_> = args
                .into_iter()
                .skip(1)
                .filter(|s| !s.starts_with('-'))
                .map(|s| {
                    let p = std::path::PathBuf::from(s);
                    if p.is_absolute() {
                        p
                    } else {
                        std::path::PathBuf::from(&cwd).join(p)
                    }
                })
                .collect();
            if !paths.is_empty() {
                app.state::<PendingFiles>().0.lock().unwrap().enqueue(paths);
                let _ = app.emit("project-open", ());
            }
            focus_editor_in_background(app.clone());
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFiles(Mutex::new({
            let mut requests = OpenRequests::default();
            requests.enqueue(
                std::env::args_os()
                    .skip(1)
                    .filter(|s| !s.to_string_lossy().starts_with('-'))
                    .map(std::path::PathBuf::from)
                    .collect(),
            );
            requests
        })))
        .manage(SelectedFile::default())
        .manage(QuitState::default())
        .invoke_handler(tauri::generate_handler![
            open_project,
            save_project,
            save_artifact,
            release_list,
            open_help,
            focus_editor,
            desktop_ready,
            close_editor,
            pending_files,
            confirm_replace,
            clear_pending,
            desktop_target
        ])
        .build(tauri::generate_context!())
        .expect("failed to build desktop application")
        .run(|app, _event| {
            if let tauri::RunEvent::WindowEvent {
                ref label,
                event: tauri::WindowEvent::Destroyed,
                ..
            } = _event
            {
                if label == "main" {
                    app.state::<QuitState>().reset();
                }
            }
            if let tauri::RunEvent::ExitRequested { ref api, .. } = _event {
                if app
                    .state::<QuitState>()
                    .should_confirm(app.get_webview_window("main").is_some())
                {
                    api.prevent_exit();
                    let _ = app.emit("app-quit-requested", ());
                }
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { ref urls } = _event {
                let paths: Vec<_> = urls.iter().filter_map(|u| u.to_file_path().ok()).collect();
                if !paths.is_empty() {
                    app.state::<PendingFiles>().0.lock().unwrap().enqueue(paths);
                    let _ = app.emit("project-open", ());
                    focus_editor_in_background(app.clone());
                }
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                focus_editor_in_background(app.clone());
            }
            let _ = app;
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacement_writes_complete_contents() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("wallet.leather");
        write_file(&path, b"old document").unwrap();
        write_file(&path, b"new").unwrap();
        assert_eq!(std::fs::read(path).unwrap(), b"new");
    }
    #[test]
    fn invalid_destination_does_not_replace_existing_project() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("wallet.leather");
        write_file(&path, b"original").unwrap();
        assert!(write_file(&path.join("invalid"), b"replacement").is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"original");
    }
}
