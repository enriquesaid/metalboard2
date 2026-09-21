#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod http;
use std::os::unix::process::CommandExt;
use std::{
    collections::HashMap,
    io::{Read, Write},
    process::{ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
};
use tauri::{Emitter, State};
struct TerminalProcess {
    pid: u32,
    stdin: ChildStdin,
}
type Processes = Arc<Mutex<HashMap<String, u32>>>;
type Terminals = Arc<Mutex<HashMap<String, TerminalProcess>>>;

fn local_command(command: &str, cwd: &str) -> Command {
    let mut cmd = Command::new("/bin/zsh");
    cmd.args(["-lc", command])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);
    if !cwd.trim().is_empty() {
        cmd.current_dir(cwd);
    }
    cmd
}

fn terminal_command(cwd: &str) -> Command {
    // `script` gives the shell a pseudo-terminal, which is required by tools
    // such as node --watch, vite, Claude Code and other interactive CLIs.
    let mut cmd = Command::new("/usr/bin/script");
    cmd.args(["-q", "/dev/null", "/bin/zsh", "-l"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);
    if !cwd.trim().is_empty() {
        cmd.current_dir(cwd);
    }
    cmd
}

#[tauri::command]
fn execute_command(
    app: tauri::AppHandle,
    state: State<'_, Processes>,
    id: String,
    command: String,
    cwd: String,
) -> Result<(), String> {
    if command.trim().is_empty() || command.len() > 100_000 {
        return Err("Comando vazio ou muito grande".into());
    }
    let mut processes = state.lock().map_err(|e| e.to_string())?;
    if processes.len() >= 4 || processes.contains_key(&id) {
        return Err("Limite de 4 execuções simultâneas".into());
    }
    let mut child = local_command(&command, &cwd)
        .spawn()
        .map_err(|e| e.to_string())?;
    let pid = child.id();
    processes.insert(id.clone(), pid);
    drop(processes);
    let registry = state.inner().clone();
    std::thread::spawn(move || {
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let pump = |mut stream: Box<dyn Read + Send>, app: tauri::AppHandle, id: String| {
            std::thread::spawn(move || {
                let mut bytes = [0u8; 4096];
                loop {
                    match stream.read(&mut bytes) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                let _ = app.emit("terminal-event", serde_json::json!({"id":id,"type":"output","data":String::from_utf8_lossy(&bytes[..n])}));
                        }
                    }
                }
            })
        };
        let out = pump(Box::new(stdout), app.clone(), id.clone());
        let err = pump(Box::new(stderr), app.clone(), id.clone());
        let result = child.wait();
        let _ = out.join();
        let _ = err.join();
        registry.lock().unwrap().remove(&id);
        match result {
            Ok(status) => {
                let _ = app.emit("terminal-event", serde_json::json!({"id":id,"type":"completed","exitCode":status.code().unwrap_or(130)}));
            }
            Err(e) => {
                let _ = app.emit(
                    "terminal-event",
                    serde_json::json!({"id":id,"type":"failed","data":e.to_string()}),
                );
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn start_terminal(
    app: tauri::AppHandle,
    state: State<'_, Terminals>,
    id: String,
    cwd: String,
) -> Result<(), String> {
    let mut processes = state.lock().map_err(|e| e.to_string())?;
    if processes.len() >= 4 || processes.contains_key(&id) {
        return Err("Limite de 4 sessões simultâneas".into());
    }
    let mut child = terminal_command(&cwd).spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("Não foi possível abrir stdin")?;
    let stdout = child.stdout.take().ok_or("Não foi possível abrir stdout")?;
    let stderr = child.stderr.take().ok_or("Não foi possível abrir stderr")?;
    let pid = child.id();
    processes.insert(id.clone(), TerminalProcess { pid, stdin });
    drop(processes);
    let registry = state.inner().clone();
    let output_app = app.clone();
    let output_id = id.clone();
    std::thread::spawn(move || {
        let pump = |mut stream: Box<dyn Read + Send>, app: tauri::AppHandle, id: String| {
            std::thread::spawn(move || {
                let mut bytes = [0u8; 4096];
                loop {
                    match stream.read(&mut bytes) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            let _ = app.emit("terminal-event", serde_json::json!({"id":id,"type":"output","data":String::from_utf8_lossy(&bytes[..n])}));
                        }
                    }
                }
            })
        };
        let out = pump(Box::new(stdout), output_app.clone(), output_id.clone());
        let err = pump(Box::new(stderr), output_app.clone(), output_id.clone());
        let result = child.wait();
        let _ = out.join();
        let _ = err.join();
        if let Ok(mut registry) = registry.lock() {
            registry.remove(&output_id);
        }
        let _ = output_app.emit("terminal-event", serde_json::json!({
            "id": output_id,
            "type": "completed",
            "exitCode": result.ok().and_then(|s| s.code()).unwrap_or(130)
        }));
    });
    Ok(())
}

#[tauri::command]
fn write_terminal(state: State<'_, Terminals>, id: String, input: String) -> Result<(), String> {
    if input.len() > 100_000 { return Err("Entrada muito grande".into()); }
    let mut processes = state.lock().map_err(|e| e.to_string())?;
    let session = processes.get_mut(&id).ok_or("Sessão não encontrada")?;
    session.stdin.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
    session.stdin.flush().map_err(|e| e.to_string())
}
#[tauri::command]
fn cancel_command(state: State<'_, Processes>, id: String) -> Result<(), String> {
    if let Some(pid) = state.lock().map_err(|e| e.to_string())?.get(&id) {
        unsafe {
            libc::kill(-(*pid as i32), libc::SIGKILL);
        }
    }
    Ok(())
}
fn main() {
    let processes: Processes = Arc::new(Mutex::new(HashMap::new()));
    let cleanup = processes.clone();
    let terminals: Terminals = Arc::new(Mutex::new(HashMap::new()));
    let terminal_cleanup = terminals.clone();
    tauri::Builder::default()
        .manage(processes)
        .manage(terminals)
        .manage(http::Requests::default())
        .invoke_handler(tauri::generate_handler![execute_command, start_terminal, write_terminal, cancel_command, http::http_fetch, http::cancel_fetch])
        .build(tauri::generate_context!())
        .expect("Falha ao iniciar Metalboard")
        .run(move |_, event| {
            if let tauri::RunEvent::Exit = event {
                for pid in cleanup.lock().unwrap().values() {
                    unsafe {
                        libc::kill(-(*pid as i32), libc::SIGKILL);
                    }
                }
                for process in terminal_cleanup.lock().unwrap().values() {
                    unsafe { libc::kill(-(process.pid as i32), libc::SIGKILL); }
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_shell_preserves_output_and_exit_status() {
        let output = local_command(
            "printf 'hello'; printf 'problem' >&2; exit 7",
            "/private/tmp",
        )
        .output()
        .unwrap();
        assert_eq!(output.stdout, b"hello");
        assert_eq!(output.stderr, b"problem");
        assert_eq!(output.status.code(), Some(7));
    }
    #[test]
    fn invalid_working_directory_does_not_execute() {
        assert!(
            local_command("printf 'must not run'", "/metalboard-nonexistent-directory")
                .spawn()
                .is_err()
        );
    }
    #[test]
    fn process_group_can_be_cancelled() {
        let mut child = local_command("sleep 30", "/private/tmp").spawn().unwrap();
        assert_eq!(
            unsafe { libc::kill(-(child.id() as i32), libc::SIGKILL) },
            0
        );
        assert!(!child.wait().unwrap().success());
    }
}
