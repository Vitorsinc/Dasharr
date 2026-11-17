use dasharr_core::join_url;

#[test]
fn joins_with_trailing_slash() {
    assert_eq!(join_url("http://h:7878/", "/api/v3/movie").unwrap().as_str(), "http://h:7878/api/v3/movie");
}

#[test]
fn keeps_base_path() {
    assert_eq!(join_url("https://x.com/radarr", "/api/v3/movie").unwrap().as_str(), "https://x.com/radarr/api/v3/movie");
    assert_eq!(join_url("https://x.com/radarr/", "api/v3/movie").unwrap().as_str(), "https://x.com/radarr/api/v3/movie");
}

#[test]
fn adds_http_scheme_when_missing() {
    assert_eq!(join_url("192.168.1.50:8080", "/api/v2/app/version").unwrap().as_str(), "http://192.168.1.50:8080/api/v2/app/version");
}
