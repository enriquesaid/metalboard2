use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{Arc, Mutex}, time::{Duration, Instant}};
use tauri::State;
pub type Requests = Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request { url: String, method: String, headers: HashMap<String, String>, body: Option<String>, timeout_ms: u64 }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response { status: u16, status_text: String, headers: HashMap<String,String>, body: serde_json::Value, duration_ms: u128 }
async fn send(request: Request) -> Result<Response,String> {
    let url = reqwest::Url::parse(&request.url).map_err(|e| e.to_string())?;
    if !["http", "https"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() { return Err("URL HTTP/HTTPS inválida".into()); }
    // Mesma política de rede interna do scraper de embed: o Fetch nunca fala
    // com localhost/redes privadas (checa IP literal e os IPs resolvidos por
    // DNS, fechando rebinding entre a checagem e a requisição).
    crate::scrape::validate_host(&url).await?;
    if !(100..=120000).contains(&request.timeout_ms) { return Err("Timeout inválido".into()); }
    if !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].contains(&request.method.as_str()) { return Err("Método inválido".into()); }
    if request.body.as_ref().is_some_and(|b| b.len() > 2_000_000) { return Err("Body excede 2 MB".into()); }
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_millis(request.timeout_ms)).build().map_err(|e| e.to_string())?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|e| e.to_string())?;
    let mut builder = client.request(method, url);
    for (key,value) in request.headers { builder = builder.header(key,value); }
    if let Some(body) = request.body { builder = builder.body(body); }
    let start = Instant::now();
    let mut response = builder.send().await.map_err(|e| if e.is_timeout() { "Tempo limite excedido.".to_owned() } else { "Falha de conexão HTTP/TLS.".to_owned() })?;
    let status = response.status();
    let headers = response.headers().iter().map(|(k,v)| (k.to_string(),v.to_str().unwrap_or("").to_owned())).collect();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Falha ao ler resposta".to_owned())? { if bytes.len() + chunk.len() > 2_000_000 { return Err("Resposta excede 2 MB".into()); } bytes.extend_from_slice(&chunk); }
    let text = String::from_utf8_lossy(&bytes).into_owned();
    let body = serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text));
    Ok(Response { status: status.as_u16(), status_text: status.canonical_reason().unwrap_or("").into(), headers, body, duration_ms: start.elapsed().as_millis() })
}
#[tauri::command]
pub async fn http_fetch(state: State<'_, Requests>, id: String, request: Request) -> Result<Response,String> {
    let (cancel, receive) = tokio::sync::oneshot::channel();
    { let mut requests = state.lock().map_err(|e| e.to_string())?; if requests.len() >= 8 || requests.contains_key(&id) { return Err("Limite de requisições simultâneas".into()); } requests.insert(id.clone(),cancel); }
    let result = tokio::select! { result = send(request) => result, _ = receive => Err("Requisição cancelada.".into()) };
    state.lock().map_err(|e| e.to_string())?.remove(&id);
    result
}
#[tauri::command]
pub fn cancel_fetch(state: State<'_, Requests>, id: String) -> Result<(),String> { if let Some(cancel) = state.lock().map_err(|e| e.to_string())?.remove(&id) { let _ = cancel.send(()); } Ok(()) }
