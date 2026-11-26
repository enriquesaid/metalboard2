#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadata;
use tauri::{
    menu::{Menu, MenuEvent, MenuItemBuilder, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager,
};

const MAIN_WINDOW: &str = "main";
const IMPORT_BOARD: &str = "board.import";
const EXPORT_BOARD: &str = "board.export";
const GENERATE_MERMAID: &str = "board.mermaid";
const SHOW_WORKSPACE: &str = "workspace.show";

pub fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let file = Submenu::with_items(
        app,
        "Arquivo",
        true,
        &[
            &MenuItemBuilder::with_id(IMPORT_BOARD, "Importar board…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
            &MenuItemBuilder::with_id(EXPORT_BOARD, "Exportar cópia do board…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("Fechar janela"))?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::quit(app, Some("Encerrar Metalboard"))?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Editar",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("Desfazer"))?,
            &PredefinedMenuItem::redo(app, Some("Refazer"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("Recortar"))?,
            &PredefinedMenuItem::copy(app, Some("Copiar"))?,
            &PredefinedMenuItem::paste(app, Some("Colar"))?,
            &PredefinedMenuItem::select_all(app, Some("Selecionar tudo"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id(GENERATE_MERMAID, "Gerar Mermaid da seleção")
                .accelerator("CmdOrCtrl+Shift+M")
                .build(app)?,
        ],
    )?;
    let window = Submenu::with_id_and_items(
        app,
        tauri::menu::WINDOW_SUBMENU_ID,
        "Janela",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("Minimizar"))?,
            &PredefinedMenuItem::maximize(app, Some("Zoom da janela"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id(SHOW_WORKSPACE, "Mostrar Metalboard").build(app)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let application = Submenu::with_items(
            app,
            "Metalboard",
            true,
            &[
                &PredefinedMenuItem::about(
                    app,
                    Some("Sobre o Metalboard"),
                    Some(AboutMetadata {
                        name: Some("Metalboard".into()),
                        version: Some(app.package_info().version.to_string()),
                        ..Default::default()
                    }),
                )?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, Some("Serviços"))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, Some("Ocultar Metalboard"))?,
                &PredefinedMenuItem::hide_others(app, Some("Ocultar outros"))?,
                &PredefinedMenuItem::show_all(app, Some("Mostrar todos"))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, Some("Encerrar Metalboard"))?,
            ],
        )?;
        let view = Submenu::with_items(
            app,
            "Visualizar",
            true,
            &[&PredefinedMenuItem::fullscreen(
                app,
                Some("Alternar tela cheia"),
            )?],
        )?;
        let help = Submenu::with_id(app, tauri::menu::HELP_SUBMENU_ID, "Ajuda", true)?;
        Menu::with_items(app, &[&application, &file, &edit, &view, &window, &help])
    }

    #[cfg(not(target_os = "macos"))]
    Menu::with_items(app, &[&file, &edit, &window])
}

pub fn show_workspace(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    let command = match event.id().as_ref() {
        IMPORT_BOARD => "import",
        EXPORT_BOARD => "export",
        GENERATE_MERMAID => "mermaid",
        SHOW_WORKSPACE => return show_workspace(app),
        _ => return,
    };
    show_workspace(app);
    let _ = app.emit_to(MAIN_WINDOW, "metalboard-menu", command);
}

#[cfg(target_os = "macos")]
pub fn remember_window_frame(app: &tauri::App) -> tauri::Result<()> {
    use objc2_app_kit::NSWindow;
    use objc2_foundation::NSString;

    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        // Setup runs on the AppKit thread and Tauri owns the window while borrowed.
        let window = unsafe { &*window.ns_window()?.cast::<NSWindow>() };
        window.setFrameAutosaveName(&NSString::from_str("MetalboardWorkspace"));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn close_workspace(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == MAIN_WINDOW && window.hide().is_ok() {
            // The local board stays mounted while the user closes and reopens its sole window.
            api.prevent_close();
        }
    }
}
