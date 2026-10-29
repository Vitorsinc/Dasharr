use dasharr_core::{ApiBody, ApiError, ApiRequest, ServiceClient, ServiceConfig, ServiceKind, ServiceSecrets};
use serde_json::json;
use wiremock::matchers::{body_string, header, header_exists, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn cfg(url: &str) -> ServiceConfig {
    ServiceConfig { local_url: Some(url.into()), external_url: None, enabled: true }
}
fn key(k: &str) -> ServiceSecrets {
    ServiceSecrets { api_key: Some(k.into()), ..Default::default() }
}
async fn ping_ok(s: &MockServer) {
    Mock::given(path("/ping")).respond_with(ResponseTemplate::new(200)).mount(s).await;
}

#[tokio::test]
async fn arr_sends_x_api_key() {
    let s = MockServer::start().await;
    ping_ok(&s).await;
    Mock::given(method("GET"))
        .and(path("/api/v3/movie"))
        .and(header("X-Api-Key", "abc"))
        .and(query_param("term", "dune"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([{"id": 1}])))
        .mount(&s)
        .await;
    let c = ServiceClient::new(ServiceKind::Radarr, cfg(&s.uri()), key("abc"));
    let mut req = ApiRequest::get("/api/v3/movie");
    req.query.push(("term".into(), "dune".into()));
    let r = c.request(req).await.unwrap();
    assert_eq!(r.status, 200);
    assert_eq!(r.body, json!([{"id": 1}]));
}

#[tokio::test]
async fn bazarr_sends_x_api_key_upper() {
    let s = MockServer::start().await;
    Mock::given(path("/api/system/status")).and(header("X-API-KEY", "bz")).respond_with(ResponseTemplate::new(200).set_body_json(json!({"data": {"bazarr_version": "1.4.5"}}))).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Bazarr, cfg(&s.uri()), key("bz"));
    assert_eq!(c.test().await.unwrap(), "1.4.5");
}

#[tokio::test]
async fn proxy_credentials_add_basic_auth() {
    let s = MockServer::start().await;
    ping_ok(&s).await;
    // "user:pass" en base64
    Mock::given(path("/api/v1/indexer")).and(header("Authorization", "Basic dXNlcjpwYXNz")).respond_with(ResponseTemplate::new(200).set_body_json(json!([]))).mount(&s).await;
    let secrets = ServiceSecrets { api_key: Some("k".into()), proxy_username: Some("user".into()), proxy_password: Some("pass".into()), ..Default::default() };
    // Solo hacia la dirección externa, que es la que pasa por el proxy.
    let external = ServiceConfig { local_url: None, external_url: Some(s.uri()), enabled: true };
    let c = ServiceClient::new(ServiceKind::Prowlarr, external, secrets);
    assert_eq!(c.request(ApiRequest::get("/api/v1/indexer")).await.unwrap().status, 200);
}

#[tokio::test]
async fn wrong_api_key_is_unauthorized() {
    let s = MockServer::start().await;
    ping_ok(&s).await;
    Mock::given(path("/api/v3/movie")).respond_with(ResponseTemplate::new(401)).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Radarr, cfg(&s.uri()), key("bad"));
    assert_eq!(c.request(ApiRequest::get("/api/v3/movie")).await.unwrap_err(), ApiError::Unauthorized);
}

#[tokio::test]
async fn server_error_is_http() {
    let s = MockServer::start().await;
    ping_ok(&s).await;
    Mock::given(path("/api/v3/movie")).respond_with(ResponseTemplate::new(500).set_body_string("boom")).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Radarr, cfg(&s.uri()), key("k"));
    assert_eq!(
        c.request(ApiRequest::get("/api/v3/movie")).await.unwrap_err(),
        ApiError::Http { status: 500, message: "boom".into() }
    );
}

#[tokio::test]
async fn json_body_is_sent() {
    let s = MockServer::start().await;
    ping_ok(&s).await;
    Mock::given(method("POST")).and(path("/api/v3/command")).and(body_string(r#"{"name":"MoviesSearch"}"#)).respond_with(ResponseTemplate::new(201).set_body_json(json!({"id": 9}))).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Radarr, cfg(&s.uri()), key("k"));
    let req = ApiRequest { method: "POST".into(), path: "/api/v3/command".into(), query: vec![], body: Some(ApiBody::Json(json!({"name": "MoviesSearch"}))) };
    assert_eq!(c.request(req).await.unwrap().status, 201);
}

#[tokio::test]
async fn not_configured() {
    let c = ServiceClient::new(ServiceKind::Radarr, ServiceConfig::default(), key("k"));
    assert_eq!(c.request(ApiRequest::get("/x")).await.unwrap_err(), ApiError::NotConfigured);
}

#[tokio::test]
async fn unreachable_is_network_error() {
    let c = ServiceClient::new(ServiceKind::Radarr, cfg("http://127.0.0.1:1"), key("k"));
    assert!(matches!(c.request(ApiRequest::get("/api/v3/movie")).await.unwrap_err(), ApiError::Network { .. }));
}

#[tokio::test]
async fn arr_test_returns_version() {
    let s = MockServer::start().await;
    Mock::given(path("/api/v3/system/status")).respond_with(ResponseTemplate::new(200).set_body_json(json!({"version": "5.2.0.1"}))).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Sonarr, cfg(&s.uri()), key("k"));
    assert_eq!(c.test().await.unwrap(), "5.2.0.1");

    let p = MockServer::start().await;
    Mock::given(path("/api/v1/system/status")).respond_with(ResponseTemplate::new(200).set_body_json(json!({"version": "1.20.0"}))).mount(&p).await;
    let c = ServiceClient::new(ServiceKind::Prowlarr, cfg(&p.uri()), key("k"));
    assert_eq!(c.test().await.unwrap(), "1.20.0");
}

// --- qBittorrent ---

fn qbit_secrets() -> ServiceSecrets {
    ServiceSecrets { username: Some("admin".into()), password: Some("secret".into()), ..Default::default() }
}

async fn qbit_login(s: &MockServer, sid: &str, times: u64) {
    Mock::given(method("POST"))
        .and(path("/api/v2/auth/login"))
        .and(body_string("username=admin&password=secret"))
        .and(header_exists("Referer"))
        .respond_with(ResponseTemplate::new(200).set_body_string("Ok.").insert_header("Set-Cookie", format!("SID={sid}; HttpOnly; path=/").as_str()))
        .expect(times)
        .mount(s)
        .await;
}

#[tokio::test]
async fn qbit_logs_in_and_sends_cookie_and_text_body() {
    let s = MockServer::start().await;
    qbit_login(&s, "s1", 1).await;
    Mock::given(path("/api/v2/app/version")).and(header("Cookie", "SID=s1")).respond_with(ResponseTemplate::new(200).set_body_string("v4.6.2")).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Qbittorrent, cfg(&s.uri()), qbit_secrets());
    let r = c.request(ApiRequest::get("/api/v2/app/version")).await.unwrap();
    assert_eq!(r.body, json!("v4.6.2"));
    assert_eq!(c.test().await.unwrap(), "v4.6.2");
}

#[tokio::test]
async fn qbit_form_body() {
    let s = MockServer::start().await;
    qbit_login(&s, "s1", 1).await;
    Mock::given(method("POST")).and(path("/api/v2/torrents/stop")).and(body_string("hashes=a%7Cb")).respond_with(ResponseTemplate::new(200)).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Qbittorrent, cfg(&s.uri()), qbit_secrets());
    let req = ApiRequest { method: "POST".into(), path: "/api/v2/torrents/stop".into(), query: vec![], body: Some(ApiBody::Form(vec![("hashes".into(), "a|b".into())])) };
    let r = c.request(req).await.unwrap();
    assert_eq!(r.status, 200);
    assert_eq!(r.body, serde_json::Value::Null);
}

#[tokio::test]
async fn qbit_relogs_once_on_403_then_gives_up() {
    let s = MockServer::start().await;
    qbit_login(&s, "s1", 2).await;
    Mock::given(path("/api/v2/torrents/info")).respond_with(ResponseTemplate::new(403)).expect(2).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Qbittorrent, cfg(&s.uri()), qbit_secrets());
    assert_eq!(c.request(ApiRequest::get("/api/v2/torrents/info")).await.unwrap_err(), ApiError::Unauthorized);
}

#[tokio::test]
async fn qbit_bad_credentials() {
    let s = MockServer::start().await;
    Mock::given(path("/api/v2/auth/login")).respond_with(ResponseTemplate::new(200).set_body_string("Fails.")).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Qbittorrent, cfg(&s.uri()), qbit_secrets());
    assert_eq!(c.test().await.unwrap_err(), ApiError::Unauthorized);
}

#[tokio::test]
async fn qbit_v5_cookie_name_with_port() {
    let s = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/v2/auth/login"))
        .respond_with(ResponseTemplate::new(200).set_body_string("Ok.").insert_header("Set-Cookie", "QBT_SID_8080=abc; HttpOnly; SameSite=Strict; path=/"))
        .mount(&s)
        .await;
    Mock::given(path("/api/v2/app/version")).and(header("Cookie", "QBT_SID_8080=abc")).respond_with(ResponseTemplate::new(200).set_body_string("v5.1.2")).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Qbittorrent, cfg(&s.uri()), qbit_secrets());
    assert_eq!(c.test().await.unwrap(), "v5.1.2");
}

#[tokio::test]
async fn qbit_ok_without_cookie_means_no_session_needed() {
    let s = MockServer::start().await;
    Mock::given(path("/api/v2/auth/login")).respond_with(ResponseTemplate::new(200).set_body_string("Ok.")).expect(1).mount(&s).await;
    Mock::given(path("/api/v2/app/version")).respond_with(ResponseTemplate::new(200).set_body_string("v5.0.0")).mount(&s).await;
    let c = ServiceClient::new(ServiceKind::Qbittorrent, cfg(&s.uri()), qbit_secrets());
    assert_eq!(c.test().await.unwrap(), "v5.0.0");
    assert_eq!(c.request(ApiRequest::get("/api/v2/app/version")).await.unwrap().status, 200);
}

#[tokio::test]
async fn proxy_basic_auth_challenge_is_reported_separately() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/system/status"))
        .respond_with(ResponseTemplate::new(401).insert_header("WWW-Authenticate", "Basic realm=\"npm\""))
        .mount(&server)
        .await;
    let client = ServiceClient::new(
        ServiceKind::Bazarr,
        ServiceConfig { local_url: Some(server.uri()), external_url: None, enabled: true },
        ServiceSecrets { api_key: Some("k".into()), ..Default::default() },
    );
    match client.test().await {
        Err(ApiError::Http { status: 401, message }) => assert!(message.contains("proxy")),
        other => panic!("esperaba error de proxy, llegó {other:?}"),
    }
}

#[tokio::test]
async fn html_instead_of_api_hints_base_url() {
    let server = MockServer::start().await;
    Mock::given(path("/api/system/status"))
        .respond_with(ResponseTemplate::new(200).set_body_raw("<html></html>", "text/html; charset=utf-8"))
        .mount(&server)
        .await;
    let client = ServiceClient::new(ServiceKind::Bazarr, cfg(&server.uri()), key("k"));
    match client.test().await {
        Err(ApiError::Http { message, .. }) => assert!(message.contains("base URL")),
        other => panic!("esperaba aviso de base URL, llegó {other:?}"),
    }
}

#[tokio::test]
async fn qbit_api_key_skips_login() {
    let server = MockServer::start().await;
    Mock::given(path("/api/v2/app/version"))
        .and(header("X-API-Key", "qbkey"))
        .respond_with(ResponseTemplate::new(200).set_body_string("v5.2.0"))
        .mount(&server)
        .await;
    let secrets = ServiceSecrets { api_key: Some("qbkey".into()), username: Some("admin".into()), password: Some("x".into()), ..Default::default() };
    let client = ServiceClient::new(ServiceKind::Qbittorrent, cfg(&server.uri()), secrets);
    assert_eq!(client.test().await.unwrap(), "v5.2.0");
}

#[tokio::test]
async fn proxy_basic_auth_not_sent_to_local_address() {
    let server = MockServer::start().await;
    ping_ok(&server).await;
    Mock::given(path("/api/v3/system/status"))
        .and(header_exists("authorization"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&server)
        .await;
    Mock::given(path("/api/v3/system/status")).respond_with(ResponseTemplate::new(200).set_body_json(json!({"version": "5.0"}))).mount(&server).await;
    let secrets = ServiceSecrets { api_key: Some("k".into()), proxy_username: Some("u".into()), proxy_password: Some("p".into()), ..Default::default() };
    let client = ServiceClient::new(ServiceKind::Radarr, cfg(&server.uri()), secrets);
    assert_eq!(client.test().await.unwrap(), "5.0");
}
