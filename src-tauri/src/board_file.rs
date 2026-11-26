#[cfg(target_os = "macos")]
use objc2_app_kit::{NSModalResponseCancel, NSModalResponseOK, NSOpenPanel, NSSavePanel};
#[cfg(target_os = "macos")]
use objc2_foundation::{MainThreadMarker, NSArray, NSData, NSDataWritingOptions, NSString, NSURL};

#[derive(serde::Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum OpenBoardResult {
    #[cfg(target_os = "macos")]
    Selected { name: String, json: String },
    #[cfg(target_os = "macos")]
    Cancelled,
    #[cfg(not(target_os = "macos"))]
    Unsupported,
}

#[cfg(target_os = "macos")]
fn select_board_path() -> Result<Option<std::path::PathBuf>, String> {
    let main_thread = MainThreadMarker::new().ok_or("O painel precisa da janela principal.")?;
    let panel = NSOpenPanel::openPanel(main_thread);
    panel.setTitle(Some(&NSString::from_str("Importar board")));
    panel.setAllowsMultipleSelection(false);
    panel.setCanChooseDirectories(false);
    panel.setCanChooseFiles(true);
    let file_types = NSArray::from_retained_slice(&[NSString::from_str("json")]);
    // This selector supports the same older macOS versions as the desktop app.
    #[allow(deprecated)]
    panel.setAllowedFileTypes(Some(&file_types));
    let response = panel.runModal();
    if response == NSModalResponseCancel {
        return Ok(None);
    }
    if response != NSModalResponseOK {
        return Err("Não foi possível abrir o painel de importação.".into());
    }
    panel
        .URL()
        .and_then(|url| url.to_file_path())
        .map(Some)
        .ok_or_else(|| "O macOS não retornou o arquivo selecionado.".into())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn open_board_json(app: tauri::AppHandle) -> Result<OpenBoardResult, String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = send.send(select_board_path());
    })
    .map_err(|error| error.to_string())?;
    let Some(path) = receive.await.map_err(|error| error.to_string())?? else {
        return Ok(OpenBoardResult::Cancelled);
    };

    tauri::async_runtime::spawn_blocking(move || {
        let name = path.file_name().ok_or("O arquivo não tem nome.")?;
        let json = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
        Ok(OpenBoardResult::Selected {
            name: name.to_string_lossy().into_owned(),
            json,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn open_board_json() -> OpenBoardResult {
    OpenBoardResult::Unsupported
}

#[cfg(target_os = "macos")]
fn write_board(url: &NSURL, json: &str) -> Result<(), String> {
    NSData::with_bytes(json.as_bytes())
        .writeToURL_options_error(url, NSDataWritingOptions::Atomic)
        .map_err(|error| error.localizedDescription().to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn save_board_json(json: String) -> Result<Option<bool>, String> {
    let main_thread = MainThreadMarker::new().ok_or("O painel precisa da janela principal.")?;
    let panel = NSSavePanel::savePanel(main_thread);
    panel.setTitle(Some(&NSString::from_str("Exportar board")));
    panel.setNameFieldStringValue(&NSString::from_str("metalboard.json"));
    panel.setCanCreateDirectories(true);
    let response = panel.runModal();
    if response == NSModalResponseCancel {
        return Ok(Some(false));
    }
    if response != NSModalResponseOK {
        return Err("Não foi possível abrir o painel de exportação.".into());
    }
    let url = panel
        .URL()
        .ok_or("O macOS não retornou o destino do arquivo.")?;
    write_board(&url, &json)?;
    Ok(Some(true))
}

// Other webviews retain their existing browser download behavior.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn save_board_json(json: String) -> Option<bool> {
    drop(json);
    None
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use std::{fs, time::SystemTime};

    #[test]
    fn export_writes_json_and_reports_a_missing_destination() {
        let stamp = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("metalboard-export-{}-{stamp}", std::process::id()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("metalboard.json");
        let url = NSURL::from_file_path(&path).unwrap();
        fs::write(&path, "previous").unwrap();
        let json = r#"{"name":"Revisão"}"#;
        write_board(&url, json).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), json);
        fs::remove_file(path).unwrap();
        fs::remove_dir(dir).unwrap();
        assert!(write_board(&url, json).is_err());
    }
}
