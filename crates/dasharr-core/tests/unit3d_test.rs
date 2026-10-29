use dasharr_core::unit3d::{fetch_stats, http_client, parse_size, parse_user, unit3d_sources, TrackerStatus};
use serde_json::{json, Value};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn indexer(id: i64, base: &str, key: &str) -> Value {
    json!({
        "id": id, "name": format!("Tracker {id}"), "enable": true, "implementation": "Cardigann", "protocol": "torrent",
        "indexerUrls": ["https://fallback.example/"],
        "fields": [{"name": "baseUrl", "value": base}, {"name": "apikey", "value": key}]
    })
}

#[test]
fn sources_keep_only_enabled_cardigann_with_clear_key() {
    let mut disabled = indexer(2, "https://b/", "k");
    disabled["enable"] = json!(false);
    let mut native = indexer(3, "https://c/", "k");
    native["implementation"] = json!("Unit3d");
    let masked = indexer(4, "https://d/", "********");
    let empty = indexer(5, "https://e/", "");
    let mut no_base = indexer(6, "", "k");
    no_base["fields"][0]["value"] = Value::Null;
    let list = json!([indexer(1, "https://a/", "k1"), disabled, native, masked, empty, no_base]);
    let got = unit3d_sources(&list);
    let ids: Vec<i64> = got.iter().map(|s| s.indexer_id).collect();
    assert_eq!(ids, vec![1, 6]);
    assert_eq!(got[1].base_url, "https://fallback.example/");
    // El token no aparece al depurar.
    assert!(!format!("{:?}", got[0]).contains("k1"));
}

#[test]
fn sizes_are_parsed_from_unit3d_text() {
    assert_eq!(parse_size(&json!("1 KiB")), Some(1024));
    assert_eq!(parse_size(&json!("1.5\u{a0}GiB")), Some(1_610_612_736));
    assert_eq!(parse_size(&json!("-2 MiB")), Some(-2_097_152));
    assert_eq!(parse_size(&json!("0 B")), Some(0));
    assert_eq!(parse_size(&json!(12345)), Some(12345));
    assert_eq!(parse_size(&json!("∞")), None);
}

#[test]
fn user_with_infinite_ratio_and_buffer() {
    let u = parse_user(&json!({
        "username": "v", "group": "User", "uploaded": "10 GiB", "downloaded": "0 B", "ratio": "∞", "buffer": "∞",
        "seeding": 3, "leeching": 0, "seedbonus": "15234.50", "hit_and_runs": 1
    }))
    .unwrap();
    assert_eq!(u.ratio, None);
    assert!(u.buffer_infinite);
    assert_eq!(u.downloaded, Some(0));
    assert_eq!(u.seedbonus, Some(15234.5));
    assert_eq!(u.hit_and_runs, Some(1));
}

async fn source_for(s: &MockServer) -> dasharr_core::unit3d::Unit3dSource {
    unit3d_sources(&json!([indexer(7, &format!("{}/", s.uri()), "tok")])).remove(0)
}

#[tokio::test]
async fn fetch_sends_bearer_and_reads_stats() {
    let s = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/user"))
        .and(header("Authorization", "Bearer tok"))
        .and(header("Accept", "application/json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "username": "vitor", "group": "Power User", "uploaded": "1.25 TiB", "downloaded": "512 GiB",
            "ratio": "2.5", "buffer": "730.1 GiB", "seeding": 312, "leeching": 0, "seedbonus": "100.00", "hit_and_runs": 0
        })))
        .mount(&s)
        .await;
    let st = fetch_stats(&http_client(), &source_for(&s).await).await;
    assert_eq!(st.status, TrackerStatus::Ok);
    let u = st.user.unwrap();
    assert_eq!(u.username, "vitor");
    assert_eq!(u.ratio, Some(2.5));
    assert_eq!(u.downloaded, Some(512 * 1024 * 1024 * 1024));
    assert_eq!(u.seeding, Some(312));
}

#[tokio::test]
async fn fetch_classifies_failures() {
    for (code, expected) in [
        (401, TrackerStatus::Unauthorized),
        (404, TrackerStatus::Unsupported),
        (429, TrackerStatus::RateLimited),
        (403, TrackerStatus::Unavailable),
        (302, TrackerStatus::Unavailable),
        (503, TrackerStatus::Unavailable),
    ] {
        let s = MockServer::start().await;
        Mock::given(path("/api/user")).respond_with(ResponseTemplate::new(code)).mount(&s).await;
        let st = fetch_stats(&http_client(), &source_for(&s).await).await;
        assert_eq!(st.status, expected, "HTTP {code}");
        assert!(st.user.is_none());
    }
}

#[tokio::test]
async fn html_or_foreign_json_is_unsupported() {
    let s = MockServer::start().await;
    Mock::given(path("/api/user")).respond_with(ResponseTemplate::new(200).set_body_string("<html>login</html>")).mount(&s).await;
    assert_eq!(fetch_stats(&http_client(), &source_for(&s).await).await.status, TrackerStatus::Unsupported);

    let s = MockServer::start().await;
    Mock::given(path("/api/user")).respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": 1}))).mount(&s).await;
    assert_eq!(fetch_stats(&http_client(), &source_for(&s).await).await.status, TrackerStatus::Unsupported);
}
