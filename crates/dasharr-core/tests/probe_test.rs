use dasharr_core::{Route, ServiceClient, ServiceConfig, ServiceKind, ServiceSecrets};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const CLOSED: &str = "http://127.0.0.1:1";

fn cfg(local: Option<&str>, external: Option<&str>) -> ServiceConfig {
    ServiceConfig { local_url: local.map(Into::into), external_url: external.map(Into::into), enabled: true }
}

#[tokio::test]
async fn local_answering_401_counts_as_local() {
    let local = MockServer::start().await;
    Mock::given(method("GET")).and(path("/ping")).respond_with(ResponseTemplate::new(401)).mount(&local).await;
    let c = ServiceClient::new(ServiceKind::Radarr, cfg(Some(&local.uri()), Some(CLOSED)), ServiceSecrets::default());
    assert_eq!(c.probe().await, Route::Local);
}

#[tokio::test]
async fn falls_back_to_remote_when_local_unreachable() {
    let ext = MockServer::start().await;
    Mock::given(method("GET")).and(path("/ping")).respond_with(ResponseTemplate::new(200)).mount(&ext).await;
    let c = ServiceClient::new(ServiceKind::Sonarr, cfg(Some(CLOSED), Some(&ext.uri())), ServiceSecrets::default());
    assert_eq!(c.probe().await, Route::Remote);
}

#[tokio::test]
async fn offline_when_nothing_answers() {
    let c = ServiceClient::new(ServiceKind::Prowlarr, cfg(Some(CLOSED), Some(CLOSED)), ServiceSecrets::default());
    assert_eq!(c.probe().await, Route::Offline);
}

#[tokio::test]
async fn remote_when_only_external_configured() {
    let ext = MockServer::start().await;
    Mock::given(method("GET")).and(path("/api/system/status")).respond_with(ResponseTemplate::new(200)).mount(&ext).await;
    let c = ServiceClient::new(ServiceKind::Bazarr, cfg(None, Some(&ext.uri())), ServiceSecrets::default());
    assert_eq!(c.probe().await, Route::Remote);
}

#[tokio::test]
async fn qbittorrent_probe_path() {
    let local = MockServer::start().await;
    Mock::given(method("GET")).and(path("/api/v2/app/version")).respond_with(ResponseTemplate::new(403)).mount(&local).await;
    let c = ServiceClient::new(ServiceKind::Qbittorrent, cfg(Some(&local.uri()), None), ServiceSecrets::default());
    assert_eq!(c.probe().await, Route::Local);
    assert_eq!(c.route().await, Some(Route::Local));
}
