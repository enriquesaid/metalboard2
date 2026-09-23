use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::{Duration, Instant};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapePayload {
    url: String,
    status: u16,
    content_type: String,
    body: String,
    duration_ms: u128,
    warnings: Vec<String>,
}

/// Endereços que o embed nunca pode buscar: localhost é tratado como host, e
/// aqui ficam loopback, redes privadas, link-local (inclui 169.254.169.254),
/// CGNAT, benchmarking, documentação, multicast e faixas reservadas.
fn ipv4_disallowed(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || (o[0] == 100 && (o[1] & 0xc0) == 64) // 100.64/10 CGNAT
        || (o[0] == 198 && (18..=19).contains(&o[1])) // 198.18/15 benchmarking
        || (o[0] == 192 && o[1] == 0 && o[2] == 0) // 192.0.0/24 tradução IPv4/IPv6
        || o[0] >= 224 // multicast + reservado (224/4 e 240/4)
}

fn ipv6_disallowed(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || matches!(ip.to_ipv4(), Some(v4) if ipv4_disallowed(v4)) // mapeados ::ffff:0:0/96 e compatíveis
        || (segments[0] & 0xfe00) == 0xfc00 // fc00::/7 único local
        || (segments[0] & 0xffc0) == 0xfe80 // fe80::/10 link-local
        || (segments[0] == 0x0064 && segments[1] == 0xff9b) // NAT64 64:ff9b::/96
        || (segments[0] == 0x2001 && segments[1] == 0x0000) // Teredo 2001::/32
        || (segments[0] == 0x2001 && segments[1] == 0x0db8) // documentação 2001:db8::/32
}

pub fn ip_disallowed(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => ipv4_disallowed(v4),
        IpAddr::V6(v6) => ipv6_disallowed(v6),
    }
}

fn hostname_disallowed(host: &str) -> bool {
    let lower = host.to_ascii_lowercase();
    lower == "localhost" || lower.ends_with(".localhost")
}

/// Aceita apenas http/https sem credenciais embutidas e com host.
pub fn normalize_url(source: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(source).map_err(|_| "Informe uma URL completa, como https://exemplo.com/pagina.".to_string())?;
    if !["http", "https"].contains(&url.scheme()) || url.username().len() > 0 || url.password().is_some() {
        return Err("Use uma URL HTTP/HTTPS sem credenciais embutidas.".into());
    }
    if url.host_str().map(str::is_empty).unwrap_or(true) {
        return Err("URL sem host.".into());
    }
    Ok(url)
}

/// Valida o host antes de qualquer requisição: IP literal checado direto;
/// nome é resolvido por DNS e qualquer endereço privado/reservado rejeita.
async fn validate_host(url: &reqwest::Url) -> Result<(), String> {
    let host = url.host_str().ok_or("URL sem host.")?;
    if hostname_disallowed(host) {
        return Err("Host não permitido: localhost é bloqueado na extração.".into());
    }
    let literal = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = literal.parse::<IpAddr>() {
        if ip_disallowed(ip) {
            return Err("Host aponta para endereço de rede privado ou reservado.".into());
        }
        return Ok(());
    }
    let port = url.port_or_known_default().unwrap_or(80);
    let addresses = tokio::net::lookup_host((host.to_string(), port))
        .await
        .map_err(|_| "Falha ao resolver o host.".to_string())?
        .collect::<Vec<_>>();
    if addresses.is_empty() {
        return Err("Falha ao resolver o host.".into());
    }
    if addresses.iter().any(|addr| ip_disallowed(addr.ip())) {
        return Err("Host aponta para endereço de rede privado ou reservado.".into());
    }
    Ok(())
}

/// Resolve o header Location contra a URL atual (absoluto, relativo ou //host).
pub fn resolve_redirect(current: &reqwest::Url, location: &str) -> Result<reqwest::Url, String> {
    let joined = current.join(location.trim()).map_err(|_| "Redirecionamento com destino inválido.".to_string())?;
    normalize_url(joined.as_str())
}

async fn send(url: String, timeout_ms: u64) -> Result<ScrapePayload, String> {
    if !(1000..=60000).contains(&timeout_ms) {
        return Err("Timeout inválido.".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|e| e.to_string())?;
    let mut current = normalize_url(&url)?;
    let mut warnings = Vec::new();
    let start = Instant::now();
    let mut response = None;
    for _ in 0..6 {
        validate_host(&current).await?;
        let request = client
            .get(current.clone())
            .header("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Metalboard/0.1")
            .header("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        let result = request.send().await.map_err(|e| if e.is_timeout() { "Tempo limite excedido.".to_owned() } else { "Falha de conexão HTTP/TLS.".to_owned() })?;
        if result.status().is_redirection() {
            let location = result
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or("Redirecionamento sem destino.")?
                .to_string();
            current = resolve_redirect(&current, &location)?;
            warnings.push(format!("Redirecionado para {current}."));
            continue;
        }
        response = Some(result);
        break;
    }
    let mut response = response.ok_or("Excesso de redirecionamentos.")?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Falha ao ler a página.".to_string())? {
        if bytes.len() + chunk.len() > 2_000_000 {
            return Err("Página excede o limite de 2 MB.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(ScrapePayload {
        url: current.to_string(),
        status,
        content_type,
        body: String::from_utf8_lossy(&bytes).into_owned(),
        duration_ms: start.elapsed().as_millis(),
        warnings,
    })
}

#[tauri::command]
pub async fn scrape_page(url: String, timeout_ms: u64) -> Result<ScrapePayload, String> {
    send(url, timeout_ms).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;
    fn v4(a: u8, b: u8, c: u8, d: u8) -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(a, b, c, d))
    }
    #[test]
    fn public_addresses_are_allowed() {
        assert!(!ip_disallowed(v4(8, 8, 8, 8)));
        assert!(!ip_disallowed(v4(1, 1, 1, 1)));
        assert!(!ip_disallowed("2606:4700::1111".parse::<IpAddr>().unwrap()));
        assert!(!ip_disallowed("2001:4860:4860::8888".parse::<IpAddr>().unwrap()));
    }
    #[test]
    fn private_loopback_and_reserved_ipv4_are_rejected() {
        for ip in [
            v4(127, 0, 0, 1),
            v4(10, 0, 0, 1),
            v4(172, 16, 0, 1),
            v4(172, 31, 255, 255),
            v4(192, 168, 0, 1),
            v4(169, 254, 169, 254),
            v4(100, 64, 0, 1),
            v4(0, 0, 0, 0),
            v4(192, 0, 2, 1),
            v4(198, 18, 0, 1),
            v4(224, 0, 0, 1),
            v4(240, 0, 0, 1),
            v4(255, 255, 255, 255),
        ] {
            assert!(ip_disallowed(ip), "{ip} deveria ser bloqueado");
        }
    }
    #[test]
    fn private_and_reserved_ipv6_are_rejected() {
        for ip in [
            "::1",
            "::",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "::ffff:10.0.0.1",
            "::ffff:127.0.0.1",
            "64:ff9b::10.0.0.1",
            "2001:db8::1",
            "ff02::1",
        ] {
            let ip = ip.parse::<IpAddr>().unwrap();
            assert!(ip_disallowed(ip), "{ip} deveria ser bloqueado");
        }
    }
    #[test]
    fn localhost_hostnames_are_rejected_without_dns() {
        assert!(hostname_disallowed("localhost"));
        assert!(hostname_disallowed("LOCALHOST"));
        assert!(hostname_disallowed("app.localhost"));
        assert!(!hostname_disallowed("example.com"));
        assert!(!hostname_disallowed("mylocalhost.com"));
    }
    #[test]
    fn normalize_url_only_accepts_plain_http_https() {
        assert!(normalize_url("https://example.com/pagina?a=1").is_ok());
        assert!(normalize_url("http://example.com").is_ok());
        assert!(normalize_url("file:///etc/passwd").is_err());
        assert!(normalize_url("ftp://example.com").is_err());
        assert!(normalize_url("https://user:senha@example.com").is_err());
        assert!(normalize_url("não é url").is_err());
    }
    #[test]
    fn redirects_resolve_relative_absolute_and_scheme_relative() {
        let base = normalize_url("https://example.com/docs/guia?page=1").unwrap();
        assert_eq!(resolve_redirect(&base, "/blog").unwrap().as_str(), "https://example.com/blog");
        assert_eq!(resolve_redirect(&base, "sub/page").unwrap().as_str(), "https://example.com/docs/sub/page");
        assert_eq!(resolve_redirect(&base, "https://outro.dev/x").unwrap().as_str(), "https://outro.dev/x");
        assert_eq!(resolve_redirect(&base, "//outro.dev/x").unwrap().as_str(), "https://outro.dev/x");
        assert!(resolve_redirect(&base, "file:///etc/passwd").is_err());
    }
}
