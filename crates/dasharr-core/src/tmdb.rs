//! Fechas de estreno por país desde TMDB (`/movie/{id}/release_dates`). Radarr solo guarda una fecha de
//! cines, digital y física, sin decir de qué país; TMDB las tiene separadas por país y por tipo.
use std::collections::HashMap;
use std::time::Duration;

use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

pub const BASE: &str = "https://api.themoviedb.org/3";
const TIMEOUT: Duration = Duration::from_secs(15);

// Tipos de estreno de TMDB.
const LIMITED: u8 = 2;
const THEATRICAL: u8 = 3;
const DIGITAL: u8 = 4;
const PHYSICAL: u8 = 5;

/// Fechas de un país en formato `AAAA-MM-DD`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseDates {
    pub cinema: Option<String>,
    pub digital: Option<String>,
    pub physical: Option<String>,
}

/// Fechas de una película por código de país ISO 3166-1 (`ES`, `US`…).
pub type CountryDates = HashMap<String, ReleaseDates>;

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum TmdbError {
    #[error("TMDB no acepta la clave")]
    InvalidKey,
    #[error("TMDB no responde: {0}")]
    Network(String),
}

#[derive(Deserialize)]
struct Response {
    #[serde(default)]
    results: Vec<Country>,
}

#[derive(Deserialize)]
struct Country {
    iso_3166_1: String,
    #[serde(default)]
    release_dates: Vec<Release>,
}

#[derive(Deserialize)]
struct Release {
    #[serde(rename = "type")]
    kind: u8,
    release_date: String,
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder().timeout(TIMEOUT).build().unwrap_or_default()
}

/// La clave de la API v3 va en la URL; el token de lectura (v4, un JWT) va como Bearer.
fn authorize(req: reqwest::RequestBuilder, key: &str) -> reqwest::RequestBuilder {
    if key.starts_with("eyJ") {
        req.bearer_auth(key)
    } else {
        req.query(&[("api_key", key)])
    }
}

async fn get(http: &reqwest::Client, base: &str, path: &str, key: &str) -> Result<Option<String>, TmdbError> {
    let res = authorize(http.get(format!("{base}{path}")), key)
        .send()
        .await
        .map_err(|e| TmdbError::Network(e.to_string()))?;
    match res.status() {
        StatusCode::UNAUTHORIZED => Err(TmdbError::InvalidKey),
        StatusCode::NOT_FOUND => Ok(None),
        s if s.is_success() => res.text().await.map(Some).map_err(|e| TmdbError::Network(e.to_string())),
        s => Err(TmdbError::Network(format!("HTTP {}", s.as_u16()))),
    }
}

/// Comprueba la clave con una petición que no depende de ninguna película.
pub async fn check_key(http: &reqwest::Client, base: &str, key: &str) -> Result<(), TmdbError> {
    get(http, base, "/configuration", key).await.map(|_| ())
}

/// Fechas de estreno de una película. Si TMDB no la conoce, devuelve un mapa vacío.
pub async fn release_dates(http: &reqwest::Client, base: &str, key: &str, tmdb_id: u64) -> Result<CountryDates, TmdbError> {
    match get(http, base, &format!("/movie/{tmdb_id}/release_dates"), key).await? {
        Some(body) => parse(&body).map_err(|e| TmdbError::Network(e.to_string())),
        None => Ok(CountryDates::new()),
    }
}

/// La primera fecha de cada tipo en cada país. En cines cuenta el estreno general y, si no lo hay, el limitado.
pub fn parse(body: &str) -> Result<CountryDates, serde_json::Error> {
    let res: Response = serde_json::from_str(body)?;
    let mut out = CountryDates::new();
    for c in res.results {
        let first = |kind: u8| {
            c.release_dates
                .iter()
                .filter(|r| r.kind == kind)
                .filter_map(|r| r.release_date.get(..10))
                .min()
                .map(str::to_string)
        };
        let dates = ReleaseDates {
            cinema: first(THEATRICAL).or_else(|| first(LIMITED)),
            digital: first(DIGITAL),
            physical: first(PHYSICAL),
        };
        if dates != ReleaseDates::default() {
            out.insert(c.iso_3166_1.to_uppercase(), dates);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const BODY: &str = r#"{"id":693134,"results":[
        {"iso_3166_1":"ES","release_dates":[
            {"certification":"7","release_date":"2024-03-08T00:00:00.000Z","type":3},
            {"certification":"","release_date":"2024-03-01T00:00:00.000Z","type":2},
            {"certification":"","release_date":"2024-04-16T00:00:00.000Z","type":4}]},
        {"iso_3166_1":"US","release_dates":[
            {"certification":"PG-13","release_date":"2024-03-01T00:00:00.000Z","type":3},
            {"certification":"PG-13","release_date":"2024-02-29T00:00:00.000Z","type":3},
            {"certification":"","release_date":"2024-05-14T00:00:00.000Z","type":5}]},
        {"iso_3166_1":"MX","release_dates":[
            {"certification":"","release_date":"2024-02-28T00:00:00.000Z","type":2}]},
        {"iso_3166_1":"FR","release_dates":[
            {"certification":"","release_date":"2024-02-15T00:00:00.000Z","type":1}]}]}"#;

    #[test]
    fn first_date_of_each_kind_per_country() {
        let d = parse(BODY).unwrap();
        assert_eq!(
            d["ES"],
            ReleaseDates { cinema: Some("2024-03-08".into()), digital: Some("2024-04-16".into()), physical: None }
        );
        assert_eq!(d["US"].cinema.as_deref(), Some("2024-02-29"));
        assert_eq!(d["US"].physical.as_deref(), Some("2024-05-14"));
        // Sin estreno general, cuenta el limitado.
        assert_eq!(d["MX"].cinema.as_deref(), Some("2024-02-28"));
        // Una premiere no es un estreno para el público.
        assert!(!d.contains_key("FR"));
    }

    #[tokio::test]
    async fn api_key_in_query_and_errors() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/movie/693134/release_dates"))
            .and(query_param("api_key", "abc"))
            .respond_with(ResponseTemplate::new(200).set_body_string(BODY))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/movie/1/release_dates"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/configuration"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;
        let http = http_client();
        let d = release_dates(&http, &server.uri(), "abc", 693134).await.unwrap();
        assert_eq!(d["ES"].cinema.as_deref(), Some("2024-03-08"));
        assert!(release_dates(&http, &server.uri(), "abc", 1).await.unwrap().is_empty());
        assert_eq!(check_key(&http, &server.uri(), "bad").await, Err(TmdbError::InvalidKey));
    }
}
