use std::time::Duration;

use dasharr_core::letterboxd::{http_client, lookup, LbError, Throttle};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const FILM: &str = r#"<html><head><meta property="og:url" content="https://letterboxd.com/film/dune-2021/">
<meta property="og:title" content="Dune (2021)"><meta name="twitter:data2" content="3.90 out of 5"></head></html>"#;

#[tokio::test]
async fn follows_tmdb_redirect_to_the_film() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/tmdb/438631/"))
        .respond_with(ResponseTemplate::new(302).insert_header("location", "/film/dune-2021/"))
        .mount(&server)
        .await;
    Mock::given(method("GET")).and(path("/film/dune-2021/")).respond_with(ResponseTemplate::new(200).set_body_string(FILM)).mount(&server).await;
    let m = lookup(&http_client(), &Throttle::default(), Duration::ZERO, &server.uri(), 438631).await.unwrap().unwrap();
    assert_eq!(m.rating, Some(3.9));
    assert_eq!(m.title, "Dune (2021)");
}

#[tokio::test]
async fn statuses() {
    let server = MockServer::start().await;
    Mock::given(path("/tmdb/1/")).respond_with(ResponseTemplate::new(404)).mount(&server).await;
    Mock::given(path("/tmdb/2/")).respond_with(ResponseTemplate::new(429)).mount(&server).await;
    Mock::given(path("/tmdb/3/")).respond_with(ResponseTemplate::new(200).set_body_string("<title>TMDB Import Result</title>")).mount(&server).await;
    let http = http_client();
    let t = Throttle::default();
    assert_eq!(lookup(&http, &t, Duration::ZERO, &server.uri(), 1).await, Ok(None));
    assert_eq!(lookup(&http, &t, Duration::ZERO, &server.uri(), 2).await, Err(LbError::Blocked));
    assert_eq!(lookup(&http, &t, Duration::ZERO, &server.uri(), 3).await, Ok(None));
}
