use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

/// Set once the frontend has flushed unsaved work and confirmed it is safe to exit.
static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

/// Move a file to the OS trash/recycle bin rather than deleting it outright.
#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

/// Crash-safe note save: write to a hidden temp file in the same directory,
/// fsync, then atomically rename over the target. A crash mid-write can never
/// leave a truncated note behind.
#[tauri::command]
async fn save_note(path: String, contents: String) -> Result<(), String> {
    use std::io::Write;
    let target = std::path::PathBuf::from(&path);
    let dir = target
        .parent()
        .ok_or_else(|| "note path has no parent directory".to_string())?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let tmp = dir.join(format!(".dayjournal-tmp-{}-{}", std::process::id(), nanos));
    let write = (|| -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(contents.as_bytes())?;
        f.sync_all()?;
        Ok(())
    })();
    if let Err(e) = write {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    std::fs::rename(&tmp, &target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Called by the frontend after flushing unsaved work in response to an
/// exit request (Cmd+Q etc.); actually quits the app.
#[tauri::command]
fn really_quit(app: tauri::AppHandle) {
    use tauri_plugin_window_state::{AppHandleExt, StateFlags};
    let _ = app.save_window_state(StateFlags::all());
    ALLOW_EXIT.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct JournalDay {
    y: i32,
    m: u32,
    d: u32,
    text: String,
    images: Vec<String>,
}

const IMAGE_EXTS: [&str; 6] = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

/// Walk the whole journal tree (<root>/YYYY/MM/DD.txt plus DD_*.jpg images)
/// in one IPC call and return every day in chronological order, optionally
/// limited to a year. Days with only images (no text) are included.
#[tauri::command]
async fn collect_entries(root: String, year: Option<i32>) -> Result<Vec<JournalDay>, String> {
    fn numeric_dirs(path: &std::path::Path, digits: usize) -> Vec<(i64, std::path::PathBuf)> {
        let mut out = Vec::new();
        if let Ok(rd) = std::fs::read_dir(path) {
            for entry in rd.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.len() == digits && name.chars().all(|c| c.is_ascii_digit()) {
                    if let Ok(n) = name.parse::<i64>() {
                        if entry.path().is_dir() {
                            out.push((n, entry.path()));
                        }
                    }
                }
            }
        }
        out.sort_by_key(|(n, _)| *n);
        out
    }

    let mut entries = Vec::new();
    for (y, year_path) in numeric_dirs(std::path::Path::new(&root), 4) {
        let y = y as i32;
        if let Some(only) = year {
            if y != only {
                continue;
            }
        }
        for (m, month_path) in numeric_dirs(&year_path, 2) {
            use std::collections::BTreeMap;
            let mut days: BTreeMap<u32, (Option<std::path::PathBuf>, Vec<String>)> = BTreeMap::new();
            if let Ok(rd) = std::fs::read_dir(&month_path) {
                for entry in rd.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.len() == 6 && name.to_ascii_lowercase().ends_with(".txt") {
                        if let Ok(d) = name[..2].parse::<u32>() {
                            days.entry(d).or_default().0 = Some(entry.path());
                        }
                    } else if name.len() > 3 && name.as_bytes()[2] == b'_' {
                        // DD_*.ext day image
                        let ext_ok = name
                            .rsplit('.')
                            .next()
                            .map(|e| IMAGE_EXTS.contains(&e.to_ascii_lowercase().as_str()))
                            .unwrap_or(false);
                        if ext_ok {
                            if let Ok(d) = name[..2].parse::<u32>() {
                                days.entry(d)
                                    .or_default()
                                    .1
                                    .push(entry.path().to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
            for (d, (text_path, mut images)) in days {
                images.sort();
                let text = text_path
                    .and_then(|p| std::fs::read_to_string(&p).ok())
                    .unwrap_or_default();
                if text.is_empty() && images.is_empty() {
                    continue;
                }
                entries.push(JournalDay { y, m: m as u32, d, text, images });
            }
        }
    }
    Ok(entries)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FsEntry {
    name: String,
    is_dir: bool,
    mtime_ms: i64,
}

/// List a folder's entries with modified times in a single IPC round-trip.
/// (Per-file stat calls from the frontend are far too slow for large folders.)
#[tauri::command]
async fn list_notes(dir: String) -> Result<Vec<FsEntry>, String> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        out.push(FsEntry {
            name,
            is_dir: meta.is_dir(),
            mtime_ms,
        });
    }
    Ok(out)
}

/// Case-insensitive full-text search across a folder's note files.
/// Returns the paths of files whose content contains the query.
#[tauri::command]
async fn search_notes(dir: String, query: String, exts: Vec<String>) -> Result<Vec<String>, String> {
    let q = query.to_lowercase();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let exts: Vec<String> = exts
        .iter()
        .map(|e| e.trim_start_matches('.').to_ascii_lowercase())
        .collect();
    let mut matches = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let ext_ok = path
            .extension()
            .map(|e| exts.iter().any(|x| e.to_string_lossy().eq_ignore_ascii_case(x)))
            .unwrap_or(false);
        if !ext_ok || !path.is_file() {
            continue;
        }
        if let Ok(text) = std::fs::read_to_string(&path) {
            if text.to_lowercase().contains(&q) {
                matches.push(path.to_string_lossy().to_string());
            }
        }
    }
    Ok(matches)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            save_note,
            really_quit,
            list_notes,
            search_notes,
            collect_entries
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Cmd+Q / app quit: give the frontend a chance to flush unsaved
            // work first. If the window is already gone (close-button path,
            // which flushes on its own), let the exit proceed.
            if let tauri::RunEvent::ExitRequested { api, .. } = &event {
                if !ALLOW_EXIT.load(Ordering::SeqCst) && !app_handle.webview_windows().is_empty() {
                    api.prevent_exit();
                    let _ = app_handle.emit("app-exit-requested", ());
                }
            }
        });
}
