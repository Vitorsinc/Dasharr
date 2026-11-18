//! Nota de Letterboxd de una película a partir de su id de TMDb. No hay API abierta, pero la web tiene
//! `letterboxd.com/tmdb/<id>/`, que salta a la ficha, y la ficha trae la nota media (sobre 5) en sus metadatos.
//! El ritmo de peticiones lo marca quien llama con `Throttle`.
use std::time::Duration;

use reqwest::StatusCode;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};

pub use crate::filmaffinity::Throttle;

pub const BASE: &str = "https://letterboxd.com";
const TIMEOUT: Duration = Duration::from_secs(15);
const USER_AGENT: &str = concat!("Mozilla/5.0 (compatible; Dasharr/", env!("CARGO_PKG_VERSION"), ")");

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LbMatch {
    pub url: String,
    pub title: String,
    /// Media de 0,5 a 5. `None` si la película aún tiene pocos votos.
    pub rating: Option<f32>,
    pub votes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum LbError {
    /// Letterboxd ha respondido 429/403: hay que dejar de preguntar un rato.
    #[error("Letterboxd ha limitado las consultas")]
    Blocked,
    #[error("Letterboxd no responde: {0}")]
    Network(String),
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder().timeout(TIMEOUT).user_agent(USER_AGENT).cookie_store(true).build().expect("cliente HTTP")
}

/// Ficha de la película con ese id de TMDb. `Ok(None)` si Letterboxd no la tiene.
pub async fn lookup(http: &reqwest::Client, throttle: &Throttle, gap: Duration, base: &str, tmdb_id: u64) -> Result<Option<LbMatch>, LbError> {
    throttle.wait(gap).await;
    let url = format!("{base}/tmdb/{tmdb_id}/");
    let res = http
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| LbError::Network(e.to_string()))?;
    let status = res.status();
    let final_url = res.url().to_string();
    if matches!(status, StatusCode::TOO_MANY_REQUESTS | StatusCode::FORBIDDEN) {
        log::warn!("Letterboxd respondió HTTP {} a /tmdb/{tmdb_id}/", status.as_u16());
        return Err(LbError::Blocked);
    }
    if status == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(LbError::Network(format!("HTTP {}", status.as_u16())));
    }
    let html = res.text().await.map_err(|e| LbError::Network(e.to_string()))?;
    let found = parse_film(&html, &final_url);
    if found.is_none() {
        log::info!("Letterboxd: TMDb {tmdb_id} no está en Letterboxd");
    }
    Ok(found)
}

fn sel(s: &str) -> Selector {
    Selector::parse(s).expect("selector")
}

fn meta(doc: &Html, selector: &str) -> Option<String> {
    doc.select(&sel(selector)).find_map(|m| m.value().attr("content")).map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

fn is_film_url(url: &str) -> bool {
    url.contains("/film/")
}

/// Lee la ficha. Si la página no es una ficha (la de "TMDB Import Result" cuando no la tienen), `None`.
pub fn parse_film(html: &str, final_url: &str) -> Option<LbMatch> {
    let doc = Html::parse_document(html);
    let url = meta(&doc, "meta[property='og:url']").filter(|u| is_film_url(u)).or_else(|| is_film_url(final_url).then(|| final_url.to_string()))?;
    let title = meta(&doc, "meta[property='og:title']").unwrap_or_default();
    // "3.90 out of 5" con dos decimales; si no está, la media redondeada del JSON-LD.
    let rating = meta(&doc, "meta[name='twitter:data2']")
        .and_then(|s| s.split_whitespace().next()?.parse::<f32>().ok())
        .or_else(|| json_number(html, "\"ratingValue\":").map(|v| v as f32))
        .filter(|v| (0.5..=5.0).contains(v));
    let votes = json_number(html, "\"ratingCount\":").map(|v| v as u64);
    Some(LbMatch { url, title, rating, votes })
}

/// Número tras una clave del JSON-LD (`"ratingCount":4644638`), sin leer todo el JSON.
fn json_number(html: &str, key: &str) -> Option<f64> {
    let rest = &html[html.find(key)? + key.len()..];
    let num: String = rest.trim_start().chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    num.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const FILM: &str = r#"<html><head>
      <meta property="og:url" content="https://letterboxd.com/film/dune-2021/">
      <meta property="og:title" content="Dune (2021)">
      <meta name="twitter:data2" content="3.90 out of 5">
      <script type="application/ld+json">
      /* <![CDATA[ */
      {"@type":"Movie","aggregateRating":{"bestRating":5,"reviewCount":845857,"@type":"AggregateRating","ratingValue":3.9,"ratingCount":4644638,"worstRating":0.5}}
      /* ]]> */
      </script></head></html>"#;

    #[test]
    fn reads_rating_and_votes() {
        let m = parse_film(FILM, "https://letterboxd.com/film/dune-2021/").unwrap();
        assert_eq!(m.url, "https://letterboxd.com/film/dune-2021/");
        assert_eq!(m.title, "Dune (2021)");
        assert_eq!(m.rating, Some(3.9));
        assert_eq!(m.votes, Some(4644638));
    }

    #[test]
    fn falls_back_to_json_ld_rating() {
        let html = FILM.replace(r#"<meta name="twitter:data2" content="3.90 out of 5">"#, "");
        assert_eq!(parse_film(&html, "").unwrap().rating, Some(3.9));
    }

    #[test]
    fn film_without_ratings_yet() {
        let html = r#"<meta property="og:url" content="https://letterboxd.com/film/wife-dog/"><meta property="og:title" content="Wife &amp; Dog (2027)">"#;
        let m = parse_film(html, "https://letterboxd.com/film/wife-dog/").unwrap();
        assert_eq!(m.title, "Wife & Dog (2027)");
        assert_eq!(m.rating, None);
        assert_eq!(m.votes, None);
    }

    #[test]
    fn unknown_tmdb_id_is_not_a_film() {
        let html = "<html><head><title>TMDB Import Result • Letterboxd</title></head></html>";
        assert_eq!(parse_film(html, "https://letterboxd.com/tmdb/999999999/"), None);
    }
}
